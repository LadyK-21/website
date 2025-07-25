import path from "path";
import fs from "fs";
import url from "url";
import { createRequire } from "module";

import jsYaml from "js-yaml";
import type { Config, Plugin } from "@docusaurus/types";

const require = createRequire(import.meta.url);

// env vars from the cli are always strings, so !!ENV_VAR returns true for "false"
function bool(value) {
  return value && value !== "false" && value !== "0";
}

function findMarkDownSync(startPath) {
  const result = [];
  const files = fs.readdirSync(path.join(__dirname, startPath), {
    withFileTypes: true,
  });
  files.forEach((dirent) => {
    if (dirent.isDirectory()) {
      result.push({
        title: dirent.name,
        path: path.join(startPath, dirent.name),
      });
    }
  });
  return result;
}
const toolsMD = findMarkDownSync("./data/tools/");

function loadMD(fsPath) {
  return fs.readFileSync(path.join(__dirname, fsPath), "utf8");
}

function loadYaml(fsPath) {
  return jsYaml.load(fs.readFileSync(path.join(__dirname, fsPath), "utf8"));
}

const users = loadYaml("./data/users.yml").map((user) => ({
  pinned: user.pinned,
  caption: user.name,
  infoLink: user.url,
  image: `/img/users/${user.logo}`,
}));

const sponsorsManual = (loadYaml("./data/sponsors.yml") || []).map(
  (sponsor) => ({
    ...sponsor,
    image: sponsor.image || path.join("/img/sponsors/", sponsor.logo),
  })
);
const sponsorsDownloaded = require(path.join(__dirname, "/data/sponsors.json"));

const sponsors = [
  ...sponsorsDownloaded
    .filter((sponsor) => sponsor.slug !== "github-sponsors")
    .map((sponsor) => {
      let website = sponsor.website;
      if (typeof website == "string") {
        website = url.parse(website).protocol ? website : `http://${website}`;
      } else if (typeof sponsor.twitterHandle == "string") {
        website = `https://twitter.com/@${sponsor.twitterHandle}`;
      } else {
        website = `https://opencollective.com/${sponsor.slug}`;
      }

      return {
        type: "opencollective",
        tier: sponsor.tier,
        name: sponsor.name,
        url: website,
        image: sponsor.avatar || "/img/user.svg",
        description: sponsor.description,
        monthly: sponsor.monthlyDonations,
        yearly: sponsor.yearlyDonations,
        total: sponsor.totalDonations,
      };
    }),
  ...sponsorsManual,
];

const videos = require(path.join(__dirname, "/data/videos.js"));
const team = loadYaml("./data/team.yml");
const tools = loadYaml("./data/tools.yml");
const setupBabelrc = loadMD("./data/tools/setup.md");

toolsMD.forEach((tool) => {
  tool.install = loadMD(`${tool.path}/install.md`);
  tool.usage = loadMD(`${tool.path}/usage.md`);
});

/**
 * A remark plugin that renders markdown contents within `:::babel8` and the nearest matching `:::` based on the
 * BABEL_8_BREAKING option. When `BABEL_8_BREAKING` is `true`, contents within `:::babel7` and `:::` will be removed,
 * otherwise everything within `:::babel8` and `:::` is removed.
 *
 * Limit: there must be an empty line before and after `:::babel[78]` and `:::`.
 *
 * With this plugin we can maintain both Babel 7 and Babel 8 docs in the same branch.
 * @param {{BABEL_8_BREAKING: boolean}} options
 * @returns md-ast transformer
 */
function remarkDirectiveBabel8Plugin({ renderBabel8 }) {
  return function transformer(root) {
    const children = root.children;
    for (let index = children.length - 1; index >= 0; index--) {
      const node = children[index];
      if (node.type === "containerDirective") {
        const directiveLabel = node.name;
        if (directiveLabel === "babel8" || directiveLabel === "babel7") {
          // @ts-expect-error expected
          if ((directiveLabel === "babel8") ^ renderBabel8) {
            // remove anything between ":::babel[78]" and ":::"
            children.splice(index, 1);
          } else {
            // remove the :::babel[78] container only
            children.splice(index, 1, ...node.children);
          }
        } else {
          transformer(node); // inside :::tip, etc
        }
      } else if (Array.isArray(node.children)) {
        transformer(node); // inside list items
      }
    }
  };
}

function docusaurusReplRoutePlugin() {
  return {
    name: "docusaurus-route-plugin",
    async contentLoaded({ actions }) {
      actions.addRoute({
        path: "/repl/",
        component: "@site/src/pages/repl",
      });
    },
  } satisfies Plugin;
}

const siteConfig: Config = {
  future: {
    // See https://docusaurus.io/blog/releases/3.6
    experimental_faster: true,
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
    },
  },
  titleDelimiter: "·",
  baseUrl: "/",
  favicon: "img/favicon.png",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "throw",
  customFields: {
    repoUrl: "https://github.com/babel/babel",
    v6Url: "https://v6.babeljs.io/docs/setup/",
    users,
    sponsors,
    videos,
    team,
    tools,
    toolsMD,
    setupBabelrc,
  },
  plugins: [docusaurusReplRoutePlugin, require("./webpack.plugin.js")],
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        theme: {
          customCss: [require.resolve("./src/css/custom.css")],
        },
        pages: {
          remarkPlugins: [require("@docusaurus/remark-plugin-npm2yarn")],
        },
        docs: {
          editUrl: "https://github.com/babel/website/edit/main/docs",

          // Docs folder path relative to website dir.
          path: "../docs",
          // Sidebars file relative to website dir.
          sidebarPath: require.resolve("./sidebars.js"),

          showLastUpdateAuthor: false,
          showLastUpdateTime: false,

          beforeDefaultRemarkPlugins: [
            [
              remarkDirectiveBabel8Plugin,
              { renderBabel8: bool(process.env.BABEL_8_BREAKING) },
            ],
          ],
          remarkPlugins: [
            [require("@docusaurus/remark-plugin-npm2yarn"), { sync: true }],
          ],
        },
        blog: {
          blogSidebarTitle: "All Blog Posts",
          blogSidebarCount: "ALL",
          onInlineAuthors: "throw",
          onUntruncatedBlogPosts: "throw",
          remarkPlugins: [require("@docusaurus/remark-plugin-npm2yarn")],
        },
        // ...
      },
    ],
  ],
  themeConfig: {
    onPageNav: "separate",
    gaTrackingId: "UA-114990275-1",
    docs: {
      sidebar: {
        hideable: true,
      },
    },
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    prism: {
      additionalLanguages: ["diff", "flow", "powershell"],
      theme: require("./src/theme/prism/light"),
      darkTheme: require("./src/theme/prism/dark"),
      magicComments: [
        {
          className: "theme-code-block-highlighted-line",
          line: "highlight-next-line",
          block: { start: "highlight-start", end: "highlight-end" },
        },
        {
          className: "code-block-error-line",
          line: "highlight-error-next-line",
        },
      ],
    },
    siteConfig: {
      headerIcon: "img/babel.svg",
      disableHeaderTitle: true,
      footerIcon: "img/babel.svg",
      ogImage: "img/ogImage.png",
      colors: {
        primaryColor: "#f5da55",
        secondaryColor: "#323330",
      },
    },
    algolia: {
      appId: "M7KGJDK6WF",
      apiKey: "6ec7d6acbfb6ed3520846a7517533c28",
      indexName: "babeljs",
      contextualSearch: false,
    },
    navbar: {
      logo: {
        alt: "Babel logo",
        src: "img/babel.svg", //revisit
      },
      items: [
        { to: "docs/", label: "Docs", position: "right" },
        { to: "setup", label: "Setup", position: "right" },
        {
          to: "repl",
          label: "Try it out",
          position: "right",
        },
        { to: "videos/", label: "Videos", position: "right" },

        { to: "blog", label: "Blog", position: "right" },
        {
          type: "search",
          position: "right",
        },
        {
          href: "https://opencollective.com/babel",
          label: "Donate",
          position: "right",
        },
        { to: "team", label: "Team", position: "right" },
        {
          href: "https://github.com/babel/babel",
          label: "GitHub",
          position: "right",
        },
      ],
    },
  },
  title: "Babel",
  tagline: "The compiler for next generation JavaScript",
  url: "https://babeljs.io",

  scripts: [
    {
      src: "https://unpkg.com/@babel/standalone@^7.0.0/babel.min.js",
      defer: true,
    },
    {
      src: "/js/components/mini-repl.js",
      type: "module",
    },
    {
      src: "/js/components/assumption-repl.js",
      type: "module",
    },
  ],
};

export default siteConfig;
