import { execFile } from 'node:child_process'
import {
  glob,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
  copyFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import { expect, it } from 'vitest'

it('loads both compiled functions with only the files included for deployment', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
    functions: Record<string, { includeFiles: string }>
  }
  const root = await realpath(tmpdir())
  const target = await mkdtemp(join(root, 'english-hub-vercel-'))
  try {
    await writeFile(join(target, 'package.json'), '{"type":"module"}')
    for (const entry of ['api/translate/index.ts', 'api/translate/usage.ts']) {
      for await (const file of glob(config.functions[entry]!.includeFiles)) {
        const destination = join(target, file)
        await mkdir(dirname(destination), { recursive: true })
        await copyFile(file, destination)
      }
      const output = join(target, entry.replace(/\.ts$/, '.js'))
      await mkdir(dirname(output), { recursive: true })
      const source = await readFile(entry, 'utf8')
      await writeFile(
        output,
        (await transform(source, { loader: 'ts', format: 'esm' })).code,
      )
      const result = await promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(new URL(`file:///${output.replaceAll('\\', '/')}`).href)}); if (typeof m.default !== 'function') process.exit(1)`,
        ],
        { cwd: target },
      )
      expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
    }
  } finally {
    if (
      dirname(await realpath(target)) === root &&
      basename(target).startsWith('english-hub-vercel-')
    )
      await rm(resolve(target), { recursive: true })
  }
})

it('compiles API functions with the root configuration used by Vercel', async () => {
  const root = await realpath(tmpdir())
  const target = await mkdtemp(join(root, 'english-hub-vercel-'))
  try {
    const config = {
      extends: resolve('tsconfig.json'),
      compilerOptions: {
        rootDir: process.cwd(),
        outDir: join(target, 'output'),
        typeRoots: [resolve('node_modules/@types')],
      },
      files: [
        resolve('api/translate/index.ts'),
        resolve('api/translate/usage.ts'),
      ],
      include: [],
    }
    await writeFile(join(target, 'tsconfig.json'), JSON.stringify(config))
    await promisify(execFile)(process.execPath, [
      resolve('node_modules/typescript/bin/tsc'),
      '-p',
      join(target, 'tsconfig.json'),
    ])
    await writeFile(join(target, 'output/package.json'), '{"type":"module"}')
    for (const entry of ['index.js', 'usage.js']) {
      const url = pathToFileURL(
        join(target, 'output/api/translate', entry),
      ).href
      await promisify(execFile)(process.execPath, [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(url)}); if (typeof m.default !== 'function') process.exit(1)`,
      ])
    }
  } finally {
    if (
      dirname(await realpath(target)) === root &&
      basename(target).startsWith('english-hub-vercel-')
    )
      await rm(resolve(target), { recursive: true })
  }
}, 20000)
