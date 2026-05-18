import { redirect } from "next/navigation";

export default async function LegacyBarberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/barbershop/team/${id}`);
}
