import { redirect } from "next/navigation";

export default async function PropertyListingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/market-place/${id}`);
}

