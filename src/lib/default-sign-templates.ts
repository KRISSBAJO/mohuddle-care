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
