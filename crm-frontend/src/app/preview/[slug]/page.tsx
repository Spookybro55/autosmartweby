import { notFound } from 'next/navigation';
import type { SectionId } from '@/lib/domain/preview-contract';
import { getPreviewBriefBySlug } from '@/lib/mock/sample-brief-loader';
import { HeroSection } from '@/components/preview/hero-section';
import { ServicesSection } from '@/components/preview/services-section';
import { ContactSection } from '@/components/preview/contact-section';
import { ReviewsSection } from '@/components/preview/reviews-section';
import { LocationSection } from '@/components/preview/location-section';
import { FaqSection } from '@/components/preview/faq-section';

const SECTION_COMPONENTS: Record<SectionId, React.ComponentType<{ brief: import('@/lib/domain/preview-contract').PreviewBrief }>> = {
  hero: HeroSection,
  services: ServicesSection,
  contact: ContactSection,
  reviews: ReviewsSection,
  location: LocationSection,
  faq: FaqSection,
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brief = getPreviewBriefBySlug(slug);

  if (!brief) {
    notFound();
  }

  return (
    <article>
      {brief.suggested_sections.map((sectionId) => {
        const Component = SECTION_COMPONENTS[sectionId];
        if (!Component) return null;
        return <Component key={sectionId} brief={brief} />;
      })}
    </article>
  );
}
