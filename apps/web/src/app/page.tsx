import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function HomePage(props: Props) {
  const searchParams = await props.searchParams;
  const code = typeof searchParams?.code === "string" ? searchParams.code : undefined;
  const next = typeof searchParams?.next === "string" ? searchParams.next : undefined;

  // If OAuth redirected to root with an auth code, forward to the callback route
  if (code) {
    const nextQuery = next ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/auth/callback?code=${encodeURIComponent(code)}${nextQuery}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}

