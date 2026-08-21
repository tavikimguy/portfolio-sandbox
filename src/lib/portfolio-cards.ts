export interface PortfolioCard {
  id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bgColor: string;
  link?: string;
}

export const PORTFOLIO_CARDS: PortfolioCard[] = [
  {
    id: 'instant',
    title: 'Instant',
    description: 'Full website migration: Framer → Astro + Cloudflare',
    x: 100,
    y: 100,
    width: 320,
    height: 200,
    bgColor: 'bg-blue-50',
    link: '#',
  },
  {
    id: 'blueprint',
    title: 'Blueprint',
    description: 'Growth design + CMS blogs (60K+ visits)',
    x: 500,
    y: 100,
    width: 320,
    height: 200,
    bgColor: 'bg-green-50',
    link: '#',
  },
  {
    id: 'flipkit',
    title: 'Flipkit',
    description: 'Founder/CMO: B2B SaaS from 0 to 800 users',
    x: 900,
    y: 100,
    width: 320,
    height: 200,
    bgColor: 'bg-purple-50',
    link: '#',
  },
  {
    id: 'freelance',
    title: 'Freelance Design',
    description: 'Brand identities, marketing, digital assets',
    x: 1300,
    y: 100,
    width: 320,
    height: 200,
    bgColor: 'bg-pink-50',
    link: '#',
  },
  {
    id: 'scopely',
    title: 'Scopely',
    description: '3D game design: modeling, texturing, animation',
    x: 100,
    y: 380,
    width: 320,
    height: 200,
    bgColor: 'bg-orange-50',
    link: '#',
  },
  {
    id: 'gallery',
    title: 'Lee Eugean Gallery',
    description: 'Gallery operations, translation, marketing',
    x: 500,
    y: 380,
    width: 320,
    height: 200,
    bgColor: 'bg-yellow-50',
    link: '#',
  },
  {
    id: 'design-systems',
    title: 'Design Systems',
    description: 'UI/UX systems, brand guidelines, component libraries',
    x: 900,
    y: 380,
    width: 320,
    height: 200,
    bgColor: 'bg-cyan-50',
    link: '#',
  },
  {
    id: 'experimental',
    title: 'Experimental Work',
    description: 'Explorations, prototypes, and side projects',
    x: 1300,
    y: 380,
    width: 320,
    height: 200,
    bgColor: 'bg-indigo-50',
    link: '#',
  },
];

// Canvas bounds — tripled from the original 1920x1440. Panning is clamped
// to these edges (see Canvas.tsx's clampPan), so this is also the hard
// limit of how far the board actually extends.
export const CANVAS_WIDTH = 5760;
export const CANVAS_HEIGHT = 4320;
