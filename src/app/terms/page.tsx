import { LegalPage } from "@/components/brand/LegalPage";

export const metadata = { title: "Terms of Service" };

// TODO(legal, Steve): replace every bracketed placeholder with final, counsel-reviewed text.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      sections={[
        { heading: "Agreement", placeholder: "LEGAL TEXT: who the agreement is between and when it applies" },
        { heading: "Using Lead Daddy", placeholder: "LEGAL TEXT: accounts, acceptable use and user responsibilities" },
        { heading: "Your data and your contacts' consent", placeholder: "LEGAL TEXT: customer responsibility for consent before texts and calls" },
        { heading: "Fees and billing", placeholder: "LEGAL TEXT: plans, billing, renewals and refunds" },
        { heading: "Third party services", placeholder: "LEGAL TEXT: providers the service relies on" },
        { heading: "Disclaimers and limits of liability", placeholder: "LEGAL TEXT" },
        { heading: "Ending the agreement", placeholder: "LEGAL TEXT: termination and what happens to data" },
        { heading: "Governing law and contact", placeholder: "LEGAL TEXT: governing law, disputes, contact details" },
      ]}
    />
  );
}
