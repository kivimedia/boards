import PageForgeBuildDetail from '@/components/pageforge/PageForgeBuildDetail';

export const metadata = { title: 'Build Detail - PageForge' };

export default function PageForgeBuildPage({ params }: { params: { buildId: string } }) {
  return <PageForgeBuildDetail buildId={params.buildId} />;
}
