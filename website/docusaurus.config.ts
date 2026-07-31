import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const GITHUB = 'https://github.com/MateenKhan/joystick';
const NPM = 'https://www.npmjs.com/package/@jugaaadi/joystick';

const config: Config = {
  title: 'joystick',
  tagline: 'A dark, touch-first analogue joystick for React',
  favicon: 'img/favicon.ico',

  future: { v4: true },

  url: 'https://joystick.jugaaadi.com',
  baseUrl: '/',

  organizationName: 'MateenKhan',
  projectName: 'joystick',

  onBrokenLinks: 'throw',

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: `${GITHUB}/tree/main/website/`,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'joystick',
      items: [
        { type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs' },
        { to: '/docs/events', label: 'Events', position: 'left' },
        { to: '/docs/maths', label: 'Maths', position: 'left' },
        { href: NPM, label: 'npm', position: 'right' },
        { href: GITHUB, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/intro' },
            { label: 'Events', to: '/docs/events' },
            { label: 'Maths', to: '/docs/maths' },
            { label: 'Headless', to: '/docs/headless' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'npm', href: NPM },
            { label: 'GitHub', href: GITHUB },
            { label: 'Issues', href: `${GITHUB}/issues` },
          ],
        },
      ],
      copyright: `MIT © ${new Date().getFullYear()} jugaaadi. Provided as is, without warranty — if this drives real hardware, put your own limits between it and the thing that moves.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
