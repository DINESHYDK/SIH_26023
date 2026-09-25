export interface Subsidiary {
  code: string;
  name: string;
  region: string;
  type: "coking" | "noncoking" | "hq";
  typeLabel: string;
  badgeColor: string;
  production: string;
  target: string;
  compliance: string;
  seams: string;
  status: string;
  isHQ?: boolean;
}

export const SUBSIDIARIES: Subsidiary[] = [
  {
    code: "BCCL",
    name: "Bharat Coking Coal Limited",
    region: "Dhanbad, Jharkhand • Jharia Coalfield",
    type: "coking",
    typeLabel: "Prime Coking Coal Basin",
    badgeColor: "text-mining-gold-bright bg-mining-gold-bright/10 border-mining-gold-bright/30",
    production: "14.82 MT",
    target: "13.95 MT (+6.2%)",
    compliance: "Form I, II, IV Valid",
    seams: "Seams IX through XVIII",
    status: "Active Surveillance",
  },
  {
    code: "ECL",
    name: "Eastern Coalfields Limited",
    region: "Sanctoria, West Bengal • Raniganj Coalfield",
    type: "noncoking",
    typeLabel: "High-Volatile Semi-Coking",
    badgeColor: "text-tertiary-container bg-tertiary-container/10 border-tertiary-container/30",
    production: "11.45 MT",
    target: "12.10 MT (-5.4%)",
    compliance: "DGMS Review Pending",
    seams: "Dishergarh & Sanctoria Seams",
    status: "Active Surveillance",
  },
  {
    code: "CCL",
    name: "Central Coalfields Limited",
    region: "Ranchi, Jharkhand • North Karanpura Basin",
    type: "coking",
    typeLabel: "Medium Coking Coal",
    badgeColor: "text-mining-gold-bright bg-mining-gold-bright/10 border-mining-gold-bright/30",
    production: "22.30 MT",
    target: "21.80 MT (+2.3%)",
    compliance: "MoEFCC Clearance Stage 2",
    seams: "Argada & Sirka Seams",
    status: "Active Surveillance",
  },
  {
    code: "WCL",
    name: "Western Coalfields Limited",
    region: "Nagpur, Maharashtra • Wardha Valley",
    type: "noncoking",
    typeLabel: "Non-Coking Thermal Grade",
    badgeColor: "text-tertiary-container bg-tertiary-container/10 border-tertiary-container/30",
    production: "16.70 MT",
    target: "16.00 MT (+4.4%)",
    compliance: "DGMS Inclinometer Clear",
    seams: "Ghughus & Ballarpur Seams",
    status: "Active Surveillance",
  },
  {
    code: "SECL",
    name: "South Eastern Coalfields Limited",
    region: "Bilaspur, Chhattisgarh • Korba & Gevra",
    type: "noncoking",
    typeLabel: "Mega Opencast Basin",
    badgeColor: "text-tertiary-container bg-tertiary-container/10 border-tertiary-container/30",
    production: "48.20 MT",
    target: "47.50 MT (+1.5%)",
    compliance: "Forest Diversion Approved",
    seams: "Kusmunda Deep & Dipka",
    status: "Active Surveillance",
  },
  {
    code: "MCL",
    name: "Mahanadi Coalfields Limited",
    region: "Sambalpur, Odisha • Talcher & Ib Valley",
    type: "noncoking",
    typeLabel: "Thermal High-Ash Reserves",
    badgeColor: "text-tertiary-container bg-tertiary-container/10 border-tertiary-container/30",
    production: "52.10 MT",
    target: "50.00 MT (+4.2%)",
    compliance: "Full DGMS Compliance",
    seams: "Ananta & Bharatpur Blocks",
    status: "Active Surveillance",
  },
  {
    code: "NCL",
    name: "Northern Coalfields Limited",
    region: "Singrauli, MP & UP • Moher Basin",
    type: "noncoking",
    typeLabel: "Fully Mechanized Opencast",
    badgeColor: "text-tertiary-container bg-tertiary-container/10 border-tertiary-container/30",
    production: "36.80 MT",
    target: "35.50 MT (+3.7%)",
    compliance: "ISO 14001 Certified",
    seams: "Purewa & Turra Seams",
    status: "Active Surveillance",
  },
  {
    code: "CMPDI",
    name: "CMPDI Central HQ & Regional Institutes",
    region: "Ranchi, Jharkhand • RI-I through RI-VII",
    type: "hq",
    typeLabel: "Apex Geological Authority",
    badgeColor: "text-govtech-emerald bg-govtech-emerald-dim border-govtech-emerald/30",
    production: "Apex Node",
    target: "7 Regional Institutes",
    compliance: "Sovereign AI Node Active",
    seams: "All National Basins Indexed",
    status: "Central Synthesizer",
    isHQ: true,
  },
];
