import { ProposalPage } from "../../../../../components/routing/Pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ProposalPage id={id}/>; }
