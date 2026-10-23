export const SITE = {
  name: "LOA Vehicle Reservation & Trip Ticket",
  shortName: "LOA VRTT",
  url: "https://vrtt.loa.edu.ph",
  institution: "Lyceum of Alabang",
  office: "Physical Facilities Management Office",
  description:
    "Reserve a Lyceum of Alabang school vehicle, track every approval stage, and print the official trip ticket from one secure system.",
  ogImage: "/og-image.png",
  ogImageAlt:
    "Lyceum of Alabang Vehicle Reservation and Trip Ticket — three-stage approval in one secure system",
  contactEmail: "itm@lyceumalabang.edu.ph",
} as const;

/** Public pages that search engines may index. */
export const PUBLIC_PAGES = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
] as const;

export function canonical(path: string) {
  return `${SITE.url}${path === "/" ? "/" : path}`;
}
