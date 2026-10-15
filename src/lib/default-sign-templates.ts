/*
 * Starter documents to sign. Lines beginning "# " start a section, and each section is initialled.
 * {{name}}, {{date}} and {{agency}} are filled in when the document is signed. Admins edit these
 * under Documents, Signing; they are a starting point and should be checked by the agency's adviser.
 */
export const DEFAULT_TEMPLATES = [
  {
    title: "Employee handbook acknowledgment",
    category: "staff" as const,
    typeName: "Signed employee handbook acknowledgment",
    body: `# Receipt of the handbook
I, {{name}}, confirm that I have received the {{agency}} employee handbook, either on paper or through Mohuddle, and that I know where to find it.

# Reading and questions
I understand that I am responsible for reading the handbook and for asking my supervisor or a coordinator about anything I do not understand.

# Policies can change
I understand that the policies in the handbook may change, and that the agency will tell me about changes. The current version is the one that applies.

# At-will employment
I understand that the handbook is not a contract of employment, and that my employment is at will unless a separate written agreement says otherwise.

# Reporting abuse, neglect and exploitation
I understand that I must report any suspected abuse, neglect or exploitation of a person we support at once, as the handbook and Tennessee law require, and that I will not be punished for reporting in good faith.`,
  },
  {
    title: "HIPAA and confidentiality agreement",
    category: "staff" as const,
    typeName: "HIPAA and confidentiality agreement",
    body: `# Protected information
I, {{name}}, understand that while working for {{agency}} I will see protected health information and other private information about the people we support, their families and my co-workers.

# Using information only for work
I will look at, use and share this information only as my job requires, and only with people who need it to provide care or run the agency.

# Keeping records safe
I will keep paper records locked away, sign out of Mohuddle when I finish, never share my password, and never store or send information about the people we support on my personal phone, email or social media.

# Photos and social media
I will not take photos or videos of the people we support, or post anything about them, unless the agency has their written consent and my supervisor has approved it.

# Reporting a breach
I will tell my supervisor straight away if I think information has been lost, seen by the wrong person or shared by mistake.

# After I leave
I understand that this duty of confidentiality continues after my employment ends, and that breaking it may lead to discipline, dismissal and legal penalties.`,
  },
  {
    title: "Direct Support Professional job description",
    category: "staff" as const,
    typeName: "Signed job description",
    body: `# The role
I, {{name}}, have read the job description for a Direct Support Professional at {{agency}}. I support people with intellectual and developmental disabilities to live safely, make their own choices and take part in their community.

# Daily duties
My duties include personal care, preparing meals, giving medication as trained and allowed, supporting plan goals, taking people to activities and appointments, keeping the home clean and safe, and writing an accurate daily note for each person I support on every shift.

# Training and credentials
I will complete the required training and keep my CPR and First Aid, medication administration and other credentials current, and send renewals to the agency before they expire.

# Physical requirements
I can lift and transfer up to 50 pounds with the equipment and training provided, stand and walk for long periods, and drive if my role requires it, with a valid license and insurance.

# Agreement
I understand the duties and requirements of this role and can perform them, with or without reasonable accommodation.`,
  },
  {
    title: "Consent for services and photo release",
    category: "person" as const,
    typeName: "Consent for services and photo release",
    body: `# Consent for services
I, {{name}}, consent to {{agency}} providing the supports set out in the Individual Support Plan, and understand I can ask questions or change my mind at any time.

# Sharing information for care
I consent to {{agency}} sharing information with doctors, nurses, therapists, the support coordinator and the state, only as needed to provide care and meet legal requirements.

# Photos
I consent to photos being taken for identification and care records. Photos will not be used in publicity or on social media without separate written permission.

# Rights
I have received a copy of the rights of people receiving services and know how to make a complaint, including to the state, without fear of retaliation.`,
  },
];

/*
 * More starter documents, added from the library one at a time by an admin (not seeded on their
 * own). Same rules as above: a starting point, to be checked against the agency's own policies.
 */
export const LIBRARY_TEMPLATES: { title: string; category: "staff" | "person" | "business"; typeName: string; body: string }[] = [
  {
    title: "Code of conduct and mandated reporting acknowledgment",
    category: "staff" as const,
    typeName: "",
    body: `# Dignity and respect
I, {{name}}, will treat every person supported by {{agency}} with dignity and respect, honour their choices, and support them to take part in their community.

# Boundaries
I will keep professional boundaries: no gifts, loans or money from the people we support or their families, no romantic or sexual relationships, and no personal use of their belongings.

# Mandated reporting
I am a mandated reporter. I will report any suspected abuse, neglect or exploitation immediately to my supervisor and as state rules require, even if I am not certain, and I will not be punished for reporting in good faith.

# Restrictive practices
I will only use the supports and interventions written in a person's plan. I will never use restraint, seclusion or punishment that is not authorised.

# Consequences
I understand that breaking this code can lead to discipline, up to and including dismissal, and may be reported to the state.`,
  },
  {
    title: "Agency vehicle use agreement",
    category: "staff" as const,
    typeName: "",
    body: `# Who may drive
I, {{name}}, will only drive an agency vehicle, or drive people we support in my own vehicle, with a valid driver's license, proof of insurance on file, and the agency's approval.

# Safe driving
I will obey traffic laws, make sure everyone wears a seat belt, never use a phone while driving, and never drive under the influence of alcohol, drugs or medication that affects driving.

# Checks and logs
I will check the vehicle before each trip, record mileage and trips as the agency asks, and report damage or faults the same day.

# Accidents
I will report any accident or traffic ticket to my supervisor at once and complete an incident report.

# Personal use
I will not use an agency vehicle for personal errands or carry passengers who are not part of the person's support.`,
  },
  {
    title: "Medication administration responsibilities",
    category: "staff" as const,
    typeName: "",
    body: `# Training first
I, {{name}}, will only give medication after completing the medication administration training required by {{agency}} and the state, and while my certificate is current.

# The right way
I will give each medication to the right person, the right drug, the right dose, by the right route, at the right time, and record it straight away on the medication record.

# Refusals and errors
I will record refusals, held doses and missed doses, and report any medication error to my supervisor and the nurse immediately.

# Storage
I will keep medication locked and stored as directed, count controlled medication as required, and never share or take anyone's medication.`,
  },
  {
    title: "Release of information authorization",
    category: "person" as const,
    typeName: "",
    body: `# What may be shared
I, {{name}}, authorise {{agency}} to share and receive information about the person supported, including health, support plan and incident information, as needed for their care.

# With whom
Information may be shared with the person's doctors, nurses, pharmacy, therapists, day program, support coordinator, health plan and the state agencies that oversee services.

# How long
This authorization lasts for one year from {{date}}, unless I withdraw it sooner in writing.

# My rights
I may withdraw this authorization at any time, except for information already shared. Refusing to sign does not affect services, unless the information is needed to provide them.`,
  },
  {
    title: "Rights and responsibilities acknowledgment",
    category: "person" as const,
    typeName: "",
    body: `# Rights
I, {{name}}, have received and had explained the rights of people receiving services from {{agency}}, including the right to be treated with dignity, to privacy, to make choices and to be free from abuse, neglect and exploitation.

# Making choices
I understand the person supported has the right to take part in planning their supports and to say no to supports they do not want.

# Responsibilities
I understand our part: to share information that affects the person's health and safety, and to tell the agency about changes such as new medication or a hospital visit.

# Questions
I know who to ask about these rights, and where to find a copy.`,
  },
  {
    title: "Complaint and grievance procedure acknowledgment",
    category: "person" as const,
    typeName: "",
    body: `# How to complain
I, {{name}}, have been told how to make a complaint to {{agency}}: by talking to any staff member, the home manager or the office, by phone, in writing or in person.

# What happens next
The agency will acknowledge a complaint, look into it, and tell me what it found and what it will do, within the time its policy sets.

# Going further
If I am not satisfied, I can take the complaint to the support coordinator, the state, or an advocacy organisation, and I have been given their contact details.

# No retaliation
Making a complaint will never affect the services the person receives.`,
  },
  {
    title: "Vendor confidentiality agreement",
    category: "business" as const,
    typeName: "",
    body: `# Confidential information
I, {{name}}, signing for my company, understand that while working with {{agency}} we may see information about the people it supports, its staff and its business, and that this information is confidential.

# Use and sharing
We will only use this information to provide the agreed service, and will not share it with anyone else unless the law requires it.

# Safeguards
We will keep the information secure, limit access to the people who need it, and return or destroy it when the work ends.

# Breaches
We will tell the agency straight away if we believe information has been lost, seen or shared without permission.`,
  },
  {
    title: "Volunteer and visitor confidentiality agreement",
    category: "business" as const,
    typeName: "",
    body: `# Privacy
I, {{name}}, understand that while I volunteer with or visit {{agency}}, I may learn private information about the people it supports.

# Keeping it private
I will not share names, photos, health information or anything personal I learn, in person, in writing or online, during or after my time with the agency.

# Photos and social media
I will not take or post photos or recordings of the people supported without the agency's written permission.

# Concerns
If I see anything that worries me about someone's safety, I will tell the staff in charge straight away.`,
  },
];
