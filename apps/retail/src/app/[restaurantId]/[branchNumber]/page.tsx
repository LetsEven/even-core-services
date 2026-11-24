import { redirect } from "next/navigation";

// Igual que los otros servicios: la pantalla de la orden vive en /order
export default async function BranchRoot({
  params,
}: {
  params: Promise<{ restaurantId: string; branchNumber: string }>;
}) {
  const { restaurantId, branchNumber } = await params;
  redirect(`/${restaurantId}/${branchNumber}/order`);
}
