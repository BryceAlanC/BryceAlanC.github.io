# Bryce Christopherson — academic website

This folder is the GitHub Pages edition of the site. It uses plain HTML and CSS,
so GitHub Pages can publish it without a build step. The homepage, research,
teaching, service, and presentations pages are included, together with a
semester page for every course offering in the teaching archive. The research
section includes concise project pages for the public papers, together with the
self-contained interactive Double-Scoring demonstration.

## Adding teaching materials

This folder is already the static GitHub repository. Put course files directly
under `materials/teaching/`, organized by course and semester. For example:

`materials/teaching/math-330-fall-2026/notes/guided-notes-student.pdf`

If you are instead editing the full source project, use the corresponding
`public/materials/teaching/` directory. The package generator mirrors that
source directory into `materials/teaching/` here.

From the static course page at `teaching/math-330-fall-2026/index.html`, the
example file is linked as
`../../materials/teaching/math-330-fall-2026/notes/guided-notes-student.pdf`.

## Publish on GitHub Pages

1. Create a public GitHub repository. Use `YOUR-USERNAME.github.io` for a primary personal site, or any other repository name for a project site.
2. Clone the repository locally, or open it with GitHub Desktop, and copy everything in this folder to the repository root.
3. Commit and push the files to `main`.
4. In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
5. Save. GitHub will display the public address after deployment finishes.

All internal paths are relative, so the site works either as a primary site or
inside a project repository.

## Updating the generated package

The site content is maintained in the main project. Run
`npm run generate:github-pages` after changing shared content or styling.

Some course packets are larger than GitHub's browser-upload limit. Publish this
package with Git or GitHub Desktop rather than the website's file uploader. All
included files remain below GitHub's 100 MiB per-file hard limit. Do not move
these PDFs into Git LFS, because a Pages site must publish the actual files.
