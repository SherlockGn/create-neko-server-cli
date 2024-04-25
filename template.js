import { glob } from 'glob'
import { promises as fs } from 'fs'
import { join } from 'path'

const checkFolder = async root => {
    let exists = true
    try {
        await fs.access(root)
    } catch {
        exists = false
    }

    if (!exists) {
        throw new Error(`Target folder does not exist`)
    }

    const isFile = (await fs.stat(root)).isFile()
    if (isFile) {
        throw new Error(`Target is a file`)
    }
}

const replaceText = async (root, files, action) => {
    for (const file of files) {
        const content = await fs.readFile(join(root, file), 'utf-8')
        const newContent = await action(content)
        await fs.writeFile(join(root, file), newContent)
    }
}

const replaceTemplate = async (root, files, settings) => {
    for (const file of files) {
        const content = await fs.readFile(join(root, file), 'utf-8')
        // const newContent = content.replace(/{{(\w+)}}/g, (_, key) => settings[key])
    }
}

const renameFile = async (root, files, action) => {
    for (const file of files) {
        const newName = await action(file)
        const oldPath = join(root, file)
        const newPath = join(root, newName)

        await fs.rename(oldPath, newPath)
    }
}

const rmFile = async (root, files) => {
    for (const file of files) {
        const path = join(root, file)
        await fs.unlink(path)
    }
}

export const run = async options => {
    const { name = null, steps = [] } = options

    if (!name) {
        throw new Error('The name of the folder is required')
    }

    const root = join(process.cwd(), name)

    await checkFolder(root)

    for (const step of steps) {
        const required = step.required ?? true

        if (!required) {
            continue
        }

        const files = await glob(step.files, { ignore: step.ignore, cwd: root })
        console.log({ files })

        if (step.type === 'replace' && typeof step.action === 'function') {
            await replaceText(root, files, step.action)
        }

        if (step.type === 'replace' && typeof step.settings === 'object') {
            await replaceTemplate(root, files, step.settings)
        }

        if (step.type === 'ren') {
            await renameFile(root, files, step.action)
        }

        if (step.type === 'rm') {
            await rmFile(root, files)
        }
    }
}
