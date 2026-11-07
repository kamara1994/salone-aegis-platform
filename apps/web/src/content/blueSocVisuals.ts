/**
 * Public vendor/product references and genuine hardware photographs for this
 * educational portfolio. These photos show representative models, not the exact
 * machines deployed in the student's original BYUI CIT lab.
 *
 * External images intentionally remain externally hosted with source and license
 * credits; never imply ownership or permission to use vendor marks in advertising.
 */
export type MediaSource = {
  src: string;
  sourceUrl: string;
  caption: string;
  credit: string;
  usage: 'representative hardware photograph' | 'official software artwork';
  licenseNote: string;
};

export const BLUE_SOC_MEDIA: Partial<Record<string,MediaSource>> = {
  palo: {
    src: 'https://stratuscloud.co.za/cdn/shop/files/PAN-PA440.webp?v=1760889201&width=600',
    sourceUrl: 'https://stratuscloud.co.za/products/pan-pa-440',
    caption: 'Palo Alto Networks PA-440 (representative NGFW model)',
    credit: 'Image: Stratus Cloud Security product photography',
    usage: 'representative hardware photograph',
    licenseNote: 'Illustrative retailer-hosted product image. Actual lab hardware model not provided; image ownership remains with its source.',
  },
  forti: {
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Fortinet_FortiGate_6501F.png?width=600',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fortinet_FortiGate_6501F.png',
    caption: 'Fortinet FortiGate 6501F (representative FortiGate hardware)',
    credit: 'Photo: Premeditated / Wikimedia Commons',
    usage: 'representative hardware photograph',
    licenseNote: 'CC BY-SA 4.0. Representative model only; exact FortiGate VDOM hardware is unconfirmed.',
  },
  'dmz1': {
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Five_Dell_PowerEdge_1950s_Front.jpg?width=600',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Five_Dell_PowerEdge_1950s_Front.jpg',
    caption: 'Dell PowerEdge rack servers (illustrative server hardware)',
    credit: 'Photo: Jon ShakataGaNai Davis / Wikimedia Commons',
    usage: 'representative hardware photograph',
    licenseNote: 'CC BY-SA 3.0. Not a photo of DMZ-1 or the original deployed server.',
  },
  'dmz2': {
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Five_Dell_PowerEdge_1950s_Front.jpg?width=600',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Five_Dell_PowerEdge_1950s_Front.jpg',
    caption: 'Dell PowerEdge rack servers (illustrative server hardware)',
    credit: 'Photo: Jon ShakataGaNai Davis / Wikimedia Commons',
    usage: 'representative hardware photograph',
    licenseNote: 'CC BY-SA 3.0. Not a photo of the original Guacamole host.',
  },
  n8n: {
    src: 'https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png',
    sourceUrl: 'https://github.com/n8n-io/n8n/blob/master/assets/n8n-logo.png',
    caption: 'n8n project logo',
    credit: 'Artwork: n8n',
    usage: 'official software artwork',
    licenseNote: 'Brand mark belongs to n8n. Shown solely to identify the software, not as endorsement.',
  },
  splunk: {
    src: 'https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/splunk.svg',
    sourceUrl: 'https://brand-assets.security.cisco.com/',
    caption: 'Splunk software branding',
    credit: 'Splunk brand identifier (Simple Icons vector artwork)',
    usage: 'official software artwork',
    licenseNote: 'Product-identification use; not an indication of a commercial relationship.',
  },
};
