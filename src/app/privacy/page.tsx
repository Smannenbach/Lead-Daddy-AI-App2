import { LegalPage } from "@/components/brand/LegalPage";

export const metadata = { title: "Privacy Policy" };

// TODO(legal, Steve): replace every bracketed placeholder with final, counsel-reviewed text.
// Headings are only a starting outline; add, remove or rename sections as counsel advises.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      sections={[
        { heading: "Who we are", placeholder: "LEGAL TEXT: company legal name, address, and how to contact us about privacy" },
        { heading: "Information we collect", placeholder: "LEGAL TEXT: what we collect from forms, imports, calls, texts, emails and the app" },
        { heading: "How we use it", placeholder: "LEGAL TEXT: purposes, including calls, texts and AI assisted outreach" },
        { heading: "Texts and calls", placeholder: "LEGAL TEXT: consent, message frequency, rates, STOP and HELP" },
        { heading: "Who we share it with", placeholder: "LEGAL TEXT: service providers and any other sharing" },
        { heading: "How long we keep it", placeholder: "LEGAL TEXT: retention periods" },
        { heading: "Your choices and rights", placeholder: "LEGAL TEXT: access, correction, deletion requests and how to make them" },
        { heading: "Security", placeholder: "LEGAL TEXT: how data is protected" },
        { heading: "Changes to this policy", placeholder: "LEGAL TEXT: how updates are announced" },
      ]}
    />
  );
}
