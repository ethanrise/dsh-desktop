#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Use the application's own contract, including every registered file's hash. */
export async function verifyTemplates(project, root) {
  const { createTemplateLibrary } = await import(pathToFileURL(join(project, 'packages/dsh-desktop-office/lib/templates.js')).href)
  const library = await createTemplateLibrary(root)
  const items = await library.list()
  if (!items.length) throw new Error('Office template catalogue is empty')
  for (const item of items) {
    for (const file of Object.keys(library.entry(item.id).files)) await library.asset(item.id, file)
  }
  console.log(`Verified ${items.length} Office templates and all registered assets`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await verifyTemplates(resolve(process.argv[2] ?? '.'), resolve(process.argv[3]))
}
