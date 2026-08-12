# Teaching materials

This directory has two equivalent locations, depending on which copy of the
site you are editing:

- In the full source project, store files under `public/materials/teaching/`.
  The package generator copies them into the static site.
- In the downloadable GitHub Pages package, store files directly under
  `materials/teaching/`. That package is already the repository root.

Use one stable, lowercase folder per course offering:

```text
math-330-fall-2026/
├── syllabus/
├── notes/
├── assignments/
└── source/
```

Suggested filenames include `syllabus.pdf`, `guided-notes-student.pdf`,
`guided-notes-instructor.pdf`, `homework-01.pdf`, and
`homework-01-solutions.pdf`.

Files authored for the course—PDF notes, assignments, syllabi, and source
archives—fit well here. Keep videos on YouTube, and keep third-party texts or
slides external unless their licenses clearly permit redistribution. Licensed
third-party files should include visible author, source, and license attribution
on their material-collection page. If you
later regenerate the static package from the full source project, make sure any
files added directly to the static package have first been copied back into the
source project.

Material collection pages are defined in `app/teaching-material-config.ts`.
After adding files, run the normal site build or `npm run build:materials` to
refresh the generated file manifest used by both the hosted site and the static
GitHub Pages edition.
