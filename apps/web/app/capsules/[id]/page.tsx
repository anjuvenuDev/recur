import CapsuleView from "../../../components/capsule-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CapsuleView id={(await params).id} />;
}
