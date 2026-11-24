"use server";

import { signIn } from "@project/auth";

export async function signInToSaveGeneratedRecipe() {
  await signIn("google", {
    redirectTo: "/my-recipes?tab=create&resumeSave=1",
  });
}

export async function signInToSaveRecipe() {
  await signIn("google", {
    redirectTo: "/my-recipes?tab=saved&resumeBookmark=1",
  });
}
