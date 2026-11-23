import json
import logging
import base64
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import main
from fastapi import HTTPException


def valid_recipe():
    return {
        "title": "Cajun Salmon",
        "servings": 4,
        "prep_minutes": 10,
        "cook_minutes": 20,
        "ingredients": [
            {
                "item": "salmon",
                "quantity": 4,
                "unit": "fillets",
                "estimated": False,
                "said": "four salmon fillets",
                "notes": None,
            },
            {
                "item": "paprika",
                "quantity": 1,
                "unit": "teaspoon",
                "estimated": True,
                "said": "some paprika",
                "notes": "Estimated from the vague amount stated.",
            },
        ],
        "steps": ["Season the salmon.", "Bake until cooked through."],
        "tips": ["Check the salmon for doneness."],
    }


def completion(content, finish_reason="stop"):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(content=content),
            )
        ]
    )


class RecipeExtractionTests(unittest.TestCase):
    def test_local_service_defaults_use_shared_folder_and_host_panoscribe(self):
        self.assertEqual(
            main.configured_shared_dir(),
            Path(main.__file__).resolve().parent / "shared-videos",
        )
        self.assertEqual(
            main.configured_panoscribe_url(),
            "http://127.0.0.1:9000",
        )
        self.assertEqual(main.configured_shared_dir("/shared"), Path("/shared"))
        self.assertEqual(
            main.configured_panoscribe_url("http://panoscribe-api:9000/"),
            "http://panoscribe-api:9000",
        )

    def test_extract_cover_frame_returns_persistent_image_payload(self):
        frame = b"\xff\xd8" + b"x" * 1_500
        with patch(
            "main.subprocess.run",
            side_effect=[
                SimpleNamespace(stdout="12.0"),
                SimpleNamespace(stdout=frame),
            ],
        ) as run:
            cover = main.extract_cover_frame(Path("/shared/video.mp4"))

        self.assertEqual(cover["mime_type"], "image/jpeg")
        self.assertEqual(base64.b64decode(cover["data"]), frame)
        self.assertEqual(run.call_count, 2)

    def test_extract_cover_frame_gracefully_handles_unavailable_ffmpeg(self):
        with patch("main.subprocess.run", side_effect=FileNotFoundError):
            self.assertIsNone(main.extract_cover_frame(Path("/shared/video.mp4")))

    def test_link_download_streams_video_within_configured_limit(self):
        response = Mock()
        response.status_code = 200
        response.headers = {
            "content-type": "video/mp4",
            "content-length": "12",
        }
        response.iter_content.return_value = iter([b"recipe ", b"video"])
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)

        with tempfile.TemporaryDirectory() as temp_dir, patch(
            "main.requests.get", return_value=response
        ):
            path = Path(temp_dir) / "recipe.mp4"
            main.download_video(
                "https://edge-api-v3.smvd.xyz/rproxy/video",
                path,
            )

            self.assertEqual(path.read_bytes(), b"recipe video")

    def test_link_download_rejects_video_over_limit_while_streaming(self):
        response = Mock()
        response.status_code = 200
        response.headers = {"content-type": "video/mp4", "content-length": "4"}
        response.iter_content.return_value = iter([b"1234", b"5678"])
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            main, "MAX_LINK_VIDEO_SIZE", 7
        ), patch("main.requests.get", return_value=response):
            with self.assertRaises(HTTPException) as raised:
                main.download_video(
                    "https://edge-api-v3.smvd.xyz/rproxy/video",
                    Path(temp_dir) / "recipe.mp4",
                )

        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(
            raised.exception.detail,
            main.LINK_VIDEO_TOO_LARGE_DETAIL,
        )
        self.assertEqual(response.iter_content.call_count, 1)

    def test_link_download_rejects_oversize_content_length_before_streaming(self):
        response = Mock()
        response.status_code = 200
        response.headers = {
            "content-type": "video/mp4",
            "content-length": "8",
        }
        response.iter_content.return_value = iter([b"12345678"])
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            main, "MAX_LINK_VIDEO_SIZE", 7
        ), patch("main.requests.get", return_value=response):
            with self.assertRaises(HTTPException) as raised:
                main.download_video(
                    "https://edge-api-v3.smvd.xyz/rproxy/video",
                    Path(temp_dir) / "recipe.mp4",
                )

        self.assertEqual(raised.exception.status_code, 413)
        response.iter_content.assert_not_called()

    def test_panoscribe_evidence_keeps_speech_and_deduplicates_ocr(self):
        segments = [
            {"source": "SPEECH", "text": "Season the salmon."},
            {"source": "ON-SCREEN", "text": "Cajun seasoning", "start": 1.0},
            {"source": "ON-SCREEN", "text": "  CAJUN   seasoning ", "start": 2.0},
            {"source": "ON-SCREEN", "text": "400 F", "start": 3.0},
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "recipe.mp4"
            path.touch()
            with patch.object(main, "SHARED_DIR", Path(temp_dir)), patch.object(
                main, "PANOSCRIBE_SHARED_DIR", Path("/shared")
            ), patch("main.requests.post") as submit, patch(
                "main.requests.get"
            ) as poll, patch("main.time.sleep"):
                submit.return_value.json.return_value = {"job_id": "job-id"}
                poll.return_value.json.return_value = {
                    "status": "done",
                    "result": {"segments": segments},
                }

                evidence = main.transcribe_with_panoscribe(path)

        self.assertEqual(
            submit.call_args.kwargs["json"],
            {"source": "/shared/recipe.mp4", "ocr": True},
        )
        self.assertEqual(evidence["transcript"], "Season the salmon.")
        self.assertEqual(
            evidence["ocr_candidates"],
            [
                {"time": 1.0, "text": "Cajun seasoning"},
                {"time": 3.0, "text": "400 F"},
            ],
        )

    def test_summarize_uses_json_schema_and_returns_valid_recipe(self):
        client = Mock()
        client.chat.completions.create.return_value = completion(
            json.dumps(valid_recipe())
        )

        model, recipe, finish_reason = main.generate_structured_recipe(
            client, "recipe evidence"
        )

        self.assertEqual(model, "summarize")
        self.assertEqual(recipe, valid_recipe())
        self.assertEqual(finish_reason, "stop")
        call = client.chat.completions.create.call_args.kwargs
        self.assertEqual(call["model"], "summarize")
        self.assertEqual(call["response_format"]["type"], "json_schema")
        schema = call["response_format"]["json_schema"]
        self.assertTrue(schema["strict"])
        self.assertEqual(
            set(schema["schema"]["required"]),
            {
                "title",
                "servings",
                "prep_minutes",
                "cook_minutes",
                "ingredients",
                "steps",
                "tips",
            },
        )

    def test_invalid_summarize_json_falls_back_to_generate(self):
        client = Mock()
        client.chat.completions.create.side_effect = [
            completion('{"title":"unterminated'),
            completion(json.dumps(valid_recipe())),
        ]

        model, recipe, _ = main.generate_structured_recipe(client, "evidence")

        self.assertEqual(model, "generate")
        self.assertEqual(recipe, valid_recipe())
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in client.chat.completions.create.call_args_list
            ],
            ["summarize", "generate"],
        )

    def test_truncated_summarize_response_falls_back_to_generate(self):
        client = Mock()
        client.chat.completions.create.side_effect = [
            completion('{"title":"Cajun', finish_reason="length"),
            completion(json.dumps(valid_recipe())),
        ]

        model, recipe, _ = main.generate_structured_recipe(client, "evidence")

        self.assertEqual(model, "generate")
        self.assertEqual(recipe, valid_recipe())

    def test_content_filtered_summarize_response_falls_back_to_generate(self):
        client = Mock()
        client.chat.completions.create.side_effect = [
            completion(json.dumps(valid_recipe()), finish_reason="content_filter"),
            completion(json.dumps(valid_recipe())),
        ]

        model, recipe, _ = main.generate_structured_recipe(client, "evidence")

        self.assertEqual(model, "generate")
        self.assertEqual(recipe, valid_recipe())

    def test_invalid_generate_response_returns_structured_service_error(self):
        client = Mock()
        client.chat.completions.create.side_effect = [
            completion("{}"),
            completion("{}"),
        ]

        with self.assertRaises(HTTPException) as raised:
            main.generate_structured_recipe(client, "evidence")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in client.chat.completions.create.call_args_list
            ],
            ["summarize", "generate"],
        )

    def test_estimated_ingredient_without_optional_note_is_valid(self):
        recipe = valid_recipe()
        recipe["ingredients"][1]["notes"] = None

        validated, reason = main.validate_recipe(recipe)

        self.assertEqual(reason, "valid")
        self.assertEqual(validated["ingredients"][1]["quantity"], 1)
        self.assertTrue(validated["ingredients"][1]["estimated"])
        self.assertIsNone(validated["ingredients"][1]["notes"])

    def test_estimated_ingredient_without_usable_quantity_is_rejected(self):
        recipe = valid_recipe()
        recipe["ingredients"][1]["quantity"] = "  "

        validated, reason = main.validate_recipe(recipe)

        self.assertIsNone(validated)
        self.assertEqual(reason, "invalid_schema")

    def test_blank_explicit_quantity_is_rejected(self):
        recipe = valid_recipe()
        recipe["ingredients"][0]["quantity"] = " "

        validated, reason = main.validate_recipe(recipe)

        self.assertIsNone(validated)
        self.assertEqual(reason, "invalid_schema")

    def test_extraction_maps_legacy_fields_and_preserves_quantity_evidence(self):
        client = Mock()
        client.chat.completions.create.return_value = completion(
            json.dumps(valid_recipe())
        )
        with patch.dict(
            "os.environ",
            {
                "CLASSROOM_AI_URL": "https://classroom-ai.example/v1",
                "CLASSROOM_AI_KEY": "test-key-not-for-logs",
            },
        ), patch(
            "main.transcribe_with_panoscribe",
            return_value={
                "provider": "panoscribe",
                "transcript": "Use four salmon fillets and some paprika.",
                "ocr_candidates": [
                    {"time": 1.5, "text": "Cajun seasoning"},
                ],
            },
        ), patch("main.OpenAI", return_value=client) as openai_client, self.assertLogs(
            "main", level=logging.INFO
        ) as captured_logs:
            result = main.extract_recipe(Path("/tmp/recipe.mp4"))

        openai_client.assert_called_once_with(
            base_url="https://classroom-ai.example/v1",
            api_key="test-key-not-for-logs",
            timeout=120.0,
            max_retries=0,
        )
        request = client.chat.completions.create.call_args.kwargs
        self.assertIn("Use four salmon fillets", request["messages"][1]["content"])
        self.assertIn("1.5s: Cajun seasoning", request["messages"][1]["content"])
        self.assertEqual(result["model"], "summarize")
        self.assertEqual(result["recipe"]["prep_time"], "10 min")
        self.assertEqual(
            result["recipe"]["instructions"][0]["instruction"],
            "Season the salmon.",
        )
        self.assertEqual(
            result["recipe"]["ingredients"][0]["said"],
            "four salmon fillets",
        )
        self.assertEqual(result["recipe"]["ingredients"][0]["quantity"], 4)
        self.assertEqual(result["recipe"]["ingredients"][0]["unit"], "fillets")
        self.assertTrue(result["recipe"]["ingredients"][1]["estimated"])
        self.assertEqual(result["recipe"]["ingredients"][1]["quantity"], 1)
        self.assertEqual(
            result["recipe"]["ingredients"][1]["notes"],
            valid_recipe()["ingredients"][1]["notes"],
        )
        self.assertEqual(result["recipe"]["tips"], valid_recipe()["tips"])
        self.assertNotIn(
            "test-key-not-for-logs",
            "\n".join(captured_logs.output),
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    unittest.main()
