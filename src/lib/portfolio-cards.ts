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
  // Renders this card AS an object from the case study — no panel, no
  // border, no title block — instead of a titled card. `still` is the idle
  // frame, `video` plays on hover.
  object?: CardObject;
  // The card itself is just the holder/trigger — it doesn't show its own
  // content. Clicking it shoots these items out onto the canvas as their
  // own small cards; closing it pulls them back in.
  items?: FolderItem[];
}

export interface CardObject {
  // Idle frame — frame 0 of `video`, so hover starts exactly where the
  // still left off.
  still: string;
  // Plays on hover, pauses back to the still on leave.
  video: string;
  // Set when the artwork is light-on-dark. The board is white, so the media
  // is inverted and multiplied into it: the dark ground goes to white and
  // drops out, the light logo goes dark and reads. Cheaper and safer than
  // keying the background out of the pixels, which would also eat the black
  // outlines the logo uses to separate its own faces.
  invertForLightBoard?: boolean;
}

export type FolderItemKind = 'image' | 'video' | 'text';

export interface FolderItem {
  id: string;
  label: string;
  kind: FolderItemKind;
  // Public path under /assets for image/video items. Every file is mirrored
  // from tavi.kim — see public/assets/manifest.json for the source URL,
  // dimensions and which route each one came off.
  src?: string;
  // Still frame for a video item, used as its <video poster>.
  poster?: string;
  // A `text` item's whole body. Reserved for copy that describes the
  // PROJECT — the role, the brief, the goal, the takeaway. Copy about one
  // particular visual belongs on that visual as a `caption` instead of
  // taking up the canvas as a module of its own.
  body?: string;
  // Copy describing THIS asset, revealed on hover rather than sitting out
  // on the board — see FolderItemCard.tsx.
  caption?: string;
  // This asset's white surround has been flood-filled to transparent, so
  // it renders with no card chrome at all and sits directly on the board.
  // Only set on slide-style artwork; screenshots keep their frame, since
  // their white IS the interface rather than a backdrop.
  cutout?: boolean;
  // Burst size, fitted to the asset's real aspect ratio inside a 280px
  // box so nothing gets letterboxed or cropped on the way out. Canvas.tsx
  // falls back to TEXT_ITEM_* when these are absent.
  width?: number;
  height?: number;
}

export const PORTFOLIO_CARDS: PortfolioCard[] = [
  {
    id: 'pieces',
    title: 'Pieces',
    description: 'The building blocks of my first major project',
    x: 2050,
    y: 1730,
    width: 320,
    height: 200,
    bgColor: 'bg-blue-50',
    link: 'https://www.tavi.kim/casestudy-pieces',
    items: [
      {
        id: 'overview',
        label: 'Overview · Student',
        kind: 'text',
        body: 'Pieces is a B2B platform designed to support and facilitate sales by users of secondhand retailers such as depop, grailed, ebay, facebook marketplace, and mercari. The platform would allow users to manage their listings across multiple platforms, view all their messages, and keep a database of inventory for easy management.',
      },
      {
        id: 'origin',
        label: 'Origin',
        kind: 'text',
        body: 'I designed this mobile app as part of a school project in 2022. The idea came from my love for secondhand clothes and later would serve as the foundation for an actual product I built named Flipkit.',
      },
      {
        id: 'goal',
        label: 'The Goal',
        kind: 'text',
        body: 'How can we remedy the gripes of the reselling community and create an intuitive database/inventory management platform that provides relevant insights into performance and trends through a more engaging interface.',
      },
      {
        id: 'user-insight',
        label: 'Research',
        kind: 'image',
        src: '/assets/pieces/user-insight.png',
        cutout: true,
        caption:
          'To gain a deeper understanding of the user base and competitor market, I conducted a thorough analysis. Being a former user of many of these platforms and a dedicated reseller myself I had an idea of where to look an a network of suitable subjects to research/survey.',
        width: 280,
        height: 158,
      },
      {
        id: 'wireframes',
        label: 'Wireframing',
        kind: 'image',
        src: '/assets/pieces/wireframes.png',
        cutout: true,
        caption:
          'I pulled a lot of my inspiration for my wireframes from existing platforms, are.na, and behance. I tried my best to keep things light while maintaining a structure and flow that I could easily modify as I discovered holes in my design framework.',
        width: 280,
        height: 158,
      },
      {
        id: 'hifi-designs',
        label: 'Hi-Fidelity Designs',
        kind: 'image',
        src: '/assets/pieces/hifi-designs.png',
        cutout: true,
        caption:
          'After multiple iterations and critique, the final designs for mobile and web were established. These designs featured sleek and easily distinguishable elements for interactive sections as well as informational components to help users better onboard and understand the platform I created.',
        width: 280,
        height: 158,
      },
      {
        id: 'app-mockup',
        label: 'Listing + Inventory',
        kind: 'image',
        src: '/assets/pieces/app-mockup-listing-and-inventory.png',
        cutout: true,
        width: 280,
        height: 243,
      },
      {
        id: 'takeaways',
        label: 'Final Thoughts',
        kind: 'text',
        body: 'The project provided valuable insight into information architecture, user research, design systems, metadata, and data aggregation. Given more time I would continue conducting more user testing and fleshing out some more of the onboarding components of the prototype. This project would serve as the starting point for my most comprehensive project to date, Flipkit.',
      },
    ],
  },
  {
    id: 'blueprint',
    title: 'Blueprint AI',
    description: 'Revolutionizing psychotherapy workflows using AI tools',
    x: 2530,
    y: 1590,
    width: 320,
    height: 200,
    bgColor: 'bg-green-50',
    link: 'https://www.tavi.kim/casestudy-blueprint',
    items: [
      {
        id: 'overview',
        label: 'Overview · Growth Designer',
        kind: 'text',
        body: 'Guided by a simple goal, help therapists save time, reduce workload, and prevent burnout, Blueprint is a vertical SaaS for modern psychotherapy. We combine integrated teletherapy, AI-assisted note-taking, and actionable insights to make clinical work faster and more consistent.',
      },
      {
        id: 'role',
        label: 'My Role',
        kind: 'text',
        body: 'In my role, I owned the design for growth initiatives. As one of two designers on the growth team, I focused on visual design, data-driven projects, and motion design for special projects. I worked end-to-end shipping web work from concept to production, architecting CMS collections, building pages, and optimizing conversion across mobile and desktop.',
      },
      {
        id: 'motion-ehr',
        label: 'Motion Design',
        kind: 'video',
        src: '/assets/blueprint/ehr-workflow-promo.mp4',
        caption:
          'One of my main responsibilities at Blueprint is creating seamless motion graphics for ad delivery, social media, and onboarding.',
        width: 280,
        height: 280,
      },
      {
        id: 'motion-soap',
        label: 'SOAP Transcription',
        kind: 'video',
        src: '/assets/blueprint/soap-note-transcription.mp4',
        width: 280,
        height: 280,
      },
      {
        id: 'motion-copy-note',
        label: 'Copy Note to EHR',
        kind: 'video',
        src: '/assets/blueprint/copy-note-to-ehr.mp4',
        width: 280,
        height: 158,
      },
      {
        id: 'golden-thread',
        label: 'The Golden Thread',
        kind: 'image',
        src: '/assets/blueprint/golden-thread-blog.png',
        caption:
          'I work closely with other members of the design team to build clean UI layouts and collateral that converts. My biggest projects were the design of our web magazine "The Golden Thread" and our therapists community "Between Sessions." These two endeavors are Blueprint\'s largest organic funnels and have helped convert hundreds of customers.',
        width: 280,
        height: 175,
      },
      {
        id: 'between-sessions',
        label: 'Between Sessions',
        kind: 'image',
        src: '/assets/blueprint/between-sessions-community.png',
        width: 280,
        height: 175,
      },
      {
        id: 'session-prep',
        label: 'Session Prep',
        kind: 'image',
        src: '/assets/home/blueprint-session-prep.png',
        width: 280,
        height: 175,
      },
      {
        id: 'social',
        label: 'Social and Paid Delivery',
        kind: 'image',
        src: '/assets/blueprint/social-deliverables.png',
        cutout: true,
        caption:
          'My last responsibility at Blueprint is creating all of our social and ad assets. These are delivered twice a week on the social end. These assets vary in nature depending on the content and copy provided, ranging from static posts to dynamic video content.',
        width: 280,
        height: 158,
      },
    ],
  },
  {
    id: 'flipkit',
    title: 'Flipkit',
    description: 'Building a B2B AI reselling integration from 0 → 1',
    x: 3030,
    y: 1760,
    width: 320,
    height: 200,
    bgColor: 'bg-purple-50',
    link: 'https://www.tavi.kim/casestudy-flipkit',
    items: [
      {
        id: 'overview',
        label: 'Overview · Founding Designer, CMO',
        kind: 'text',
        body: 'For years, second-hand has grown faster than any other segment retail, hundreds of marketplaces, brick-and-mortar stores, and apps have emearged but the way we sell online hasn\'t changed at all. Our goal was to revolutionize the selling process by combining AI tools with clever user flows that allow users to sell their old stuff with just a single picture.',
      },
      {
        id: 'role',
        label: 'My Role',
        kind: 'text',
        body: 'As one of the original three founders of Flipkit, I owned the design, brining the product from 0 → 1, creating the design system, branding, and user flow. I also took on the role of the CMO, putting me in charge of the company\'s outward facing persona and brand, creating every deliverable, conducting market research, and user tests to optimize our product.',
      },
      {
        id: 'goal',
        label: 'The Goal',
        kind: 'text',
        body: 'How can we design a delightful user expereince, cohesive brand identity, and social strategy that is both flexible and simple for an aged audience and growing younger userbase.',
      },
      {
        id: 'process',
        label: 'The Reselling Process',
        kind: 'image',
        src: '/assets/flipkit/reselling-process-diagram.png',
        cutout: true,
        caption:
          'To begin the creation of our product we began by analyzing two categories of competing product: existing solutions and the current pipeline without the solution. Collecting data from over 400 responses while simultaneously onboarding users onto a beta version of the product to collect further data downstream.',
        width: 280,
        height: 158,
      },
      {
        id: 'user-research',
        label: 'Research and Analysis',
        kind: 'image',
        src: '/assets/flipkit/user-research.png',
        cutout: true,
        caption: 'My goal was to inform decisions regarding flow, key features, and points of friction. Here are my main findings:',
        width: 280,
        height: 158,
      },
      {
        id: 'problems',
        label: 'Problems',
        kind: 'image',
        src: '/assets/flipkit/problems.png',
        cutout: true,
        width: 280,
        height: 158,
      },
      {
        id: 'user-flow',
        label: 'User Flow',
        kind: 'image',
        src: '/assets/flipkit/user-flow-map.png',
        caption:
          'To organize my thoughts before I began wireframing and creating our first mockups, I created a suitable userflow that would describe the actions of the user and help us decide which parts of the product to build first. I centered the design around a comprehensive dashboard that would display high level information at a glance.',
        width: 280,
        height: 158,
      },
      {
        id: 'lofi',
        label: 'Early Ideation and Lo-Fi',
        kind: 'image',
        src: '/assets/flipkit/lofi-designs.png',
        cutout: true,
        width: 280,
        height: 158,
      },
      {
        id: 'dashboard',
        label: 'Delivery and Launch',
        kind: 'image',
        src: '/assets/flipkit/dashboard-home.png',
        caption:
          'After numerous iterations, the hi-fidelity designs were completed and shipped off to development. From this point onwards, all design changes were made directly via html injections and edits.',
        width: 280,
        height: 151,
      },
      {
        id: 'app-screens',
        label: 'App Screens',
        kind: 'video',
        src: '/assets/home/flipkit-app-screens.mp4',
        width: 280,
        height: 158,
      },
      {
        id: 'web-dashboard',
        label: 'Web Dashboard',
        kind: 'video',
        src: '/assets/home/flipkit-web-dashboard.mp4',
        width: 280,
        height: 280,
      },
      {
        id: 'brand',
        label: 'Brand and Community',
        kind: 'text',
        body: 'My main priorities then shifted towards building up the Flipkit brand and community working closely with numerous microinfluencers, creating 50+ creatives for socials, driving 200k+ interactions, and optimizing our website for SEO and frictionless conversions.',
      },
    ],
  },
  {
    id: 'wfoc',
    title: 'Wharton Future of Cities',
    description: 'Building the brand for a city planning conference',
    x: 3470,
    y: 2010,
    // Sized to the logo object's own 560x550 rather than the standard card
    // 320x200 — it's artwork now, not a panel, so it shouldn't be letterboxed.
    width: 300,
    height: 295,
    bgColor: 'bg-pink-50',
    link: 'https://www.tavi.kim/casestudy-wfoc',
    // The rotating 3D monogram that stood for this project on the Framer
    // site. Cropped tight to the logo's own travel across the animation, so
    // it sits as an object rather than inside a 16:9 letterbox.
    object: {
      still: '/assets/wfoc/logo-object-still.png',
      video: '/assets/wfoc/logo-object.mp4',
      invertForLightBoard: true,
    },
    items: [
      {
        id: 'overview',
        label: 'Overview · Graphic Designer',
        kind: 'text',
        body: 'The Wharton Future of Cities Conference is an annual city planning conference held at the University of Pennsylvania. For years the audience has primarily been thought leaders, professors, and government officials. As the conferences audience has grown a new demographic has begun to emerge with graduate students and individuals in the mid twenties.',
      },
      {
        id: 'brief',
        label: 'The Brief',
        kind: 'text',
        body: 'As a freelance graphic designer I was tasked with redesigning the brand identity of the conference and breathing new life into their outdated design system. The final deliverables included a new palette, typeface, logo, social assets, and physical merchandise.',
      },
      {
        id: 'logo-3d',
        label: 'The Logo',
        kind: 'image',
        src: '/assets/wfoc/logo-3d-variations.png',
        cutout: true,
        caption:
          'For the logo I took two approaches. The first approach took elements from urban planning such as housing infrastructure, building heatmaps, and weather maps to guide my thinking. The client asked for a 3D option that would be appropriate as a .gif for their website and social deliverables.',
        width: 280,
        height: 158,
      },
      {
        id: 'logo-animation',
        label: 'Logo Animation',
        kind: 'video',
        src: '/assets/shared/wfoc-logo-animation.mp4',
        width: 280,
        height: 158,
      },
      {
        id: 'logo-mark',
        label: 'Logo Mark',
        kind: 'image',
        src: '/assets/wfoc/logo-mark.png',
        cutout: true,
        caption:
          'The second logo was at the special request of the client for a Scandinavian inspired flat mark. For this approach I once again explored symbols from urban planning such as traffic signs and crosswalks to create a system of symbols that could be used to form the conference title.',
        width: 280,
        height: 158,
      },
      {
        id: 'typeface-palette',
        label: 'Typeface + Palette',
        kind: 'image',
        src: '/assets/wfoc/typeface-and-palette.png',
        cutout: true,
        caption:
          'The palette was designed to be mostly neutral colors for visibility and softness, while conveying the major themes: technology (purple), nature (green), humanity (blue), and infrastructure (orange). For the typeface the most important consideration was that it be highly legible and simple — Neue Haas Grotesk by Christian Schwartz fit this criteria perfectly.',
        width: 280,
        height: 158,
      },
      {
        id: 'merchandise',
        label: 'Merchandise',
        kind: 'image',
        src: '/assets/wfoc/merchandise.png',
        cutout: true,
        caption:
          'With the two logos built out and approved, the next step was to create marketing materials for the conference. I created a system of templates that could easily be edited and contain the proper branding elements to subtly reference the brand system I created.',
        width: 280,
        height: 158,
      },
      {
        id: 'print-posters',
        label: 'Print Posters',
        kind: 'image',
        src: '/assets/wfoc/print-posters.png',
        cutout: true,
        width: 280,
        height: 158,
      },
      {
        id: 'social',
        label: 'Social Deliverables',
        kind: 'image',
        src: '/assets/wfoc/social-deliverables.png',
        cutout: true,
        width: 280,
        height: 158,
      },
    ],
  },
  // Don Memo, Paintings and Slowly are personal/art work rather than case
  // studies — the site gives them a title and one line each, so that's all
  // that's here. Tavi is reworking these three into their own thing, so
  // expect significant changes.
  {
    id: 'don-memo',
    title: 'Don Memo',
    description: 'Rebranding my favorite campus food truck',
    x: 1970,
    y: 2210,
    width: 320,
    height: 200,
    bgColor: 'bg-orange-50',
    link: 'https://www.tavi.kim/',
    items: [
      {
        id: 'truck',
        label: 'Don Memo',
        kind: 'image',
        src: '/assets/home/photo-food-truck.jpg',
        caption: 'Rebranding my favorite campus food truck.',
        width: 280,
        height: 210,
      },
    ],
  },
  {
    id: 'paintings',
    title: 'Paintings',
    description: 'Oil painting — New York City',
    x: 2490,
    y: 2040,
    width: 320,
    height: 200,
    bgColor: 'bg-yellow-50',
    link: 'https://www.tavi.kim/',
    items: [
      { id: 'pink-hat', label: 'Pink Hat', kind: 'image', src: '/assets/shared/painting-pink-hat-original.jpg', width: 280, height: 273 },
      { id: 'cowboy', label: 'Cowboy Portrait', kind: 'image', src: '/assets/home/painting-cowboy-portrait.jpg', width: 211, height: 280 },
      { id: 'masked-figure', label: 'Masked Figure', kind: 'image', src: '/assets/home/painting-masked-figure.webp', width: 280, height: 280 },
      { id: 'yellow-face', label: 'Yellow Face', kind: 'image', src: '/assets/home/painting-yellow-face.webp', width: 280, height: 280 },
      { id: 'hand-and-cloth', label: 'Hand and Cloth', kind: 'image', src: '/assets/home/painting-hand-and-cloth.webp', width: 280, height: 280 },
      {
        id: 'figure-with-melon',
        label: 'Figure with Melon',
        kind: 'image',
        src: '/assets/home/painting-figure-with-melon.webp',
        width: 280,
        height: 280,
      },
      { id: 'fist-and-face', label: 'Fist and Face', kind: 'image', src: '/assets/home/painting-fist-and-face.jpg', width: 276, height: 280 },
      {
        id: 'child-in-red-trees',
        label: 'Child in Red Trees',
        kind: 'image',
        src: '/assets/home/painting-child-in-red-trees.jpg',
        width: 280,
        height: 268,
      },
      { id: 'blue-hands', label: 'Blue Hands', kind: 'image', src: '/assets/home/painting-blue-hands.jpg', width: 226, height: 280 },
      { id: 'i-love-mommy', label: 'I Love Mommy', kind: 'image', src: '/assets/home/painting-i-love-mommy.jpg', width: 280, height: 175 },
    ],
  },
  {
    id: 'sprint',
    title: 'UX Sprint',
    description: 'Building a homepage for a stock trading app in 8 hours',
    x: 3010,
    y: 2270,
    width: 320,
    height: 200,
    bgColor: 'bg-cyan-50',
    link: 'https://www.tavi.kim/casestudy-sprint',
    items: [
      {
        id: 'overview',
        label: 'Overview · Student',
        kind: 'text',
        body: 'As a personal challenge, I asked a professor to give me a UI sprint challenge that would help me learn to adapt, design on the fly, and deliver on a tight schedule. I was given 8 hours to redesign a finance app\'s homepage, submitting hi-fidelity wireframes and a short write-up.',
      },
      {
        id: 'guidelines',
        label: 'Guidelines',
        kind: 'text',
        body: 'Redesign the home page of a portfolio management app to create a user-centric and visually appealing experience. Key elements: portfolio overview (total value, percentage change, allocation by asset class), a recent activity section, call-to-action buttons, and personalization for data-driven users seeking actionable insights at a glance.',
      },
      {
        id: 'inspo',
        label: 'Ideation and Wireframing',
        kind: 'image',
        src: '/assets/sprint/inspo-and-wireframing.png',
        cutout: true,
        caption:
          'With time in mind, I made very rough wireframes of my initial idea and gathered some inspiration from my are.na board. I designed with simplicity and a seamless userflow in mind. I opted towards a modular design aesthetic that would make adding new features and sections easy.',
        width: 280,
        height: 158,
      },
      {
        id: 'hifi-frames',
        label: 'Hi-Fidelity Designs',
        kind: 'image',
        src: '/assets/sprint/hifi-frames.png',
        cutout: true,
        caption:
          'After a few iterations and millions of edits (as many as my time limit would allow) I delivered the following hi fidelity wireframes to my professor.',
        width: 280,
        height: 231,
      },
      {
        id: 'app-mockup',
        label: 'App Mockup',
        kind: 'image',
        src: '/assets/shared/sprint-app-mockup.png',
        cutout: true,
        width: 280,
        height: 202,
      },
      {
        id: 'writeup',
        label: 'Writeup',
        kind: 'text',
        body: 'Typeface: Nunito, a well balanced sans serif that is modern and clean. Palette: a dark theme that highlights key areas using a pop of color — green for gains, red for losses, yellow as a universal highlight for CTAs. Hierarchy: headers semibold (24px), subheadings medium (16px), body medium (12px). Layout: a modular, widget-based layout to compartmentalize sections, making it easy to implement additional sections and features as needed.',
      },
    ],
  },
  {
    id: 'slowly',
    title: 'Slowly',
    description: 'A zine made for my 24th birthday',
    x: 2350,
    y: 2530,
    width: 320,
    height: 200,
    bgColor: 'bg-indigo-50',
    link: 'https://www.tavi.kim/',
    items: [
      {
        id: 'cover',
        label: 'Slowly · 천천히',
        kind: 'image',
        src: '/assets/home/poster-slowly-cloud.png',
        caption: 'A zine made for my 24th birthday. Tavi Kim — New York, 2025.',
        width: 280,
        height: 198,
      },
    ],
  },
];

// Canvas bounds — tripled from the original 1920x1440. Panning is clamped
// to these edges (see Canvas.tsx's clampPan), so this is also the hard
// limit of how far the board actually extends.
export const CANVAS_WIDTH = 5760;
export const CANVAS_HEIGHT = 4320;
