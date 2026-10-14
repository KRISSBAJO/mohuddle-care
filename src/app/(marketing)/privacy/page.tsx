import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy and non-discrimination" };

export default function PrivacyPage() {
  return (
    <section className="container-x max-w-3xl py-16">
      <p className="eyebrow">Policies</p>
      <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Privacy and non-discrimination</h1>
      <div className="prose-sm mt-8 space-y-6 text-mute">
        <div>
          <h2 className="text-xl font-bold text-ink">HIPAA and privacy</h2>
          <p className="mt-2">
            {site.legalName} states its commitment to protecting client privacy in line with federal standards.
            Contact the office for its full privacy policy and questions about handling personal or health information.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">Non-discrimination</h2>
          <p className="mt-2">
            Milestone’s published service policy covers equal access across race, color, national origin, sex,
            disability and age. It also lists background clearance and ethical hiring standards among its commitments.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">Questions</h2>
          <p className="mt-2">
            Write to <a className="text-brand" href={`mailto:${site.email}`}>{site.email}</a> or call {site.phone}.
          </p>
        </div>
      </div>
    </section>
  );
}
