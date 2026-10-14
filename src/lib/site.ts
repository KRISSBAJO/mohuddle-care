/* Facts about the organisation that the public site shows. Change them here, once. */
export const site = {
  name: "Milestone",
  legalName: "Milestone Home Healthcare Service",
  tagline: "Person-centered support across Middle Tennessee",
  description:
    "Milestone provides individualized, person-centered support to adults and children with intellectual and developmental disabilities in Nashville and Middle Tennessee.",
  phone: "615-964-7088",
  phoneHref: "tel:+16159647088",
  fax: "615-964-7315",
  email: "contact@milestonecare.net",
  address: "2131 Murfreesboro Pike, Suite 202A",
  cityStateZip: "Nashville, TN 37217",
  hours: "Monday to Friday, 9:30am to 5:30pm",
  serviceAreas: ["Davidson County", "Rutherford County", "Williamson County", "Surrounding counties"],
  mission: "Support adults and children with disabilities, champion their rights and dignity, and deliver care shaped to their individual needs.",
  vision: "Lead the way in person-centered support that helps adults and children with intellectual and developmental disabilities thrive.",
  story: "Founded in Nashville, Milestone works to help adults with intellectual and developmental disabilities participate in everyday community life across Middle Tennessee.",
  credentials: [
    "Tennessee Department of Disabilities and Aging",
    "Tennessee Health Facilities Commission",
    "Background clearance and ethical hiring standards",
  ],
};

export type Service = {
  slug: string;
  name: string;
  short: string;
  points: string[];
  icon: "sun" | "home" | "users" | "heart" | "briefcase" | "hand" | "shield" | "clock" | "compass";
};

export const services: Service[] = [
  {
    slug: "day-services",
    name: "Day Services",
    short: "Structured daytime programs that build skills, friendships and a place in the community.",
    points: ["Skill building", "Social enrichment", "Transportation included"],
    icon: "sun",
  },
  {
    slug: "supported-living",
    name: "Supported Living",
    short: "Round-the-clock individualized support at home, so independence grows in familiar surroundings.",
    points: ["Customized care plans", "Help with daily living", "Emotional and safety support"],
    icon: "home",
  },
  {
    slug: "family-model-residential",
    name: "Family Model Residential",
    short: "Life in a nurturing host family home, matched carefully for long-term stability.",
    points: ["Family-style housing", "Compatible placements", "Lifelong support"],
    icon: "users",
  },
  {
    slug: "foster-care",
    name: "Foster Care Services",
    short: "Temporary or permanent care with licensed foster providers in a stable, secure home.",
    points: ["Safety and structure", "Emotional support", "Ongoing training for foster families"],
    icon: "heart",
  },
  {
    slug: "supported-employment",
    name: "Supported Employment",
    short: "Finding, training for and keeping meaningful work that fits each person's interests.",
    points: ["Job coaching", "Resume and interview preparation", "Employer partnerships"],
    icon: "briefcase",
  },
  {
    slug: "personal-assistance",
    name: "Personal Assistance",
    short: "Trusted direct support with hygiene, meals and mobility, on a schedule that fits.",
    points: ["Flexible scheduling", "Trusted direct support professionals", "Client-centered delivery"],
    icon: "hand",
  },
  {
    slug: "residential-rehabilitation",
    name: "Residential Rehabilitation",
    short: "24-hour support and supervision in group or single-occupancy homes.",
    points: ["Life skills development", "Medication management", "Transportation and care coordination"],
    icon: "shield",
  },
  {
    slug: "respite-care",
    name: "Respite Care",
    short: "Short-term relief for families and caregivers, at home or in one of our settings.",
    points: ["Emergency and scheduled respite", "In-home or facility-based", "Peace of mind for caregivers"],
    icon: "clock",
  },
  {
    slug: "semi-independent-services",
    name: "Semi-Independent Services",
    short: "Occasional help for people who manage most things on their own.",
    points: ["Financial guidance", "Health management support", "Life coaching"],
    icon: "compass",
  },
];

export const openings = [
  { title: "Direct Support Professionals" },
  { title: "Program Coordinators" },
  { title: "Residential Managers" },
  { title: "Nurses" },
];

export const applicationForms = {
  employment: "/forms/MHHS_Job_Application_Digital.pdf",
  foster: "/forms/Foster-Home-Application-for-Parenting.pdf",
};

export const applicationRequirements = {
  employment: ["Age 18 or older", "Background clearance", "A valid driver’s license for roles that require driving", "A high school diploma or GED"],
  foster: ["Age 21 or older", "U.S. citizenship or a green card", "Successful background checks", "Completion of required training"],
};
