import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Phone, RefreshCw } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api";
import { ROLE_TITLES } from "@/lib/workflow";
import { getPhoneDirectoryFn } from "@/server-functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/phone-directory")({
  head: () => ({
    meta: [
      { title: `LOA Phone Directory — ${SITE.name}` },
      { name: "description", content: "Contact details for assigned LOA signatories." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PhoneDirectory,
});

function PhoneDirectory() {
  const directory = useQuery({
    queryKey: ["phone-directory"],
    queryFn: () => unwrap(getPhoneDirectoryFn()),
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="LOA Phone Directory"
        description="Contact the assigned signatories when a request needs attention."
      />
      {directory.isPending ? (
        <LoadingPanel label="Loading the phone directory" />
      ) : directory.isError ? (
        <Section title="Signatory contacts">
          <div className="p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load the phone directory.</p>
            <Button className="mt-4" variant="outline" onClick={() => void directory.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        </Section>
      ) : directory.data.length === 0 ? (
        <Section title="Signatory contacts">
          <EmptyState title="No signatory contacts are configured yet.">
            Ask an administrator to create and assign signatory accounts.
          </EmptyState>
        </Section>
      ) : (
        <Section title="Signatory contacts">
          <ul className="divide-y">
            {directory.data.map((contact) => (
              <li
                key={contact.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{ROLE_TITLES[contact.role]}</p>
                </div>
                {contact.phoneNumber ? (
                  <a
                    className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                    href={`tel:${contact.phoneNumber.replace(/[^\d+]/g, "")}`}
                  >
                    <Phone className="h-4 w-4" aria-hidden />
                    {contact.phoneNumber}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Contact number not provided</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
