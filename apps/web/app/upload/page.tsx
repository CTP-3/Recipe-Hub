import { redirect } from "next/navigation";

export default function UploadPage() {
  redirect("/my-recipes?tab=create");
}
