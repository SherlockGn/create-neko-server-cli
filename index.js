#!/usr/bin/env node

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'

import { getArgs } from './argument.js'
import { run } from './template.js'

const dir = dirname(fileURLToPath(import.meta.url))

const argDefinitions = {
    project: {
        display: 'Project name',
        description: 'The name of the project.',
        type: 'string',
        default: 'my neko project',
        index: 0,
        use: async name => {
            if (!/^[a-zA-Z0-9_\- ]+$/.test(name)) {
                throw new Error(
                    `VALIDATE: The name must consist of alphabets, numbers, underscores (_), hyphens (-), or spaces (' ')`
                )
            }
            let exists = true
            try {
                await fs.access(join(process.cwd(), name))
            } catch {
                exists = false
            }
            if (exists) {
                throw new Error(
                    `VALIDATE: The directory "${name}" already exists.`
                )
            }
            return name
        }
    },
    nodemon: {
        display: 'Enable Nodemon',
        description:
            'If enabled, a file named nodemon.json containing basic settings will be created in your project directory.',
        type: 'boolean',
        default: true
    },
    prettier: {
        display: 'Enable Prettier',
        description:
            'If enabled, a file named .prettierrc will be created in your project directory. If you want to customize the content, use this CLI with an argument to specify the path of the file containing the Prettier configuration.',
        type: 'file',
        default: async () =>
            JSON.parse(await fs.readFile(join(dir, '.prettierrc'), 'utf-8')),
        use: async path => JSON.parse(await fs.readFile(path, 'utf-8'))
    },
    module: {
        display: 'JavaScript module style',
        description:
            'Specifying your preference for using either CommonJS or ECMAScript Modules (ESM) for JavaScript modules.',
        type: [
            {
                name: 'esm',
                display: 'ESM'
            },
            {
                name: 'cjs',
                display: 'CommonJS'
            }
        ],
        default: 'esm'
    },
    ext: {
        display: 'Backend JavaScript file extension',
        description:
            'Specifying whether you would like to use the file extensions .mjs/.cjs instead of simply using .js for your backend JavaScript files.',
        type: 'boolean',
        default: true
    },
    server: {
        display: 'Server engine',
        description:
            'Sepcifying the Node.js backend HTTP engine. Currently only Express is supported.',
        type: [
            {
                name: 'express',
                display: 'Express'
            }
        ],
        default: 'express'
    },

    db: {
        display: 'Database engine',
        description: 'Sepcifying the backend database engine.',
        type: [
            {
                name: 'sqlite',
                display: 'Sqlite3'
            },
            {
                name: 'file',
                display: 'File system'
            }
        ],
        default: 'sqlite'
    },
    orm: {
        display: 'ORM framework',
        description: 'Sepcifying the ORM framework.',
        type: [
            {
                name: 'sequelize',
                display: 'Sequelize'
            },
            {
                name: 'vanilla',
                display: 'Vanilla'
            }
        ],
        default: 'sequelize'
    },
    communicate: {
        display: 'Communication style',
        description:
            'Specifying the communication style between the server and clients.',
        type: [
            {
                name: 'rpc',
                display: 'RPC'
            },
            {
                name: 'restful',
                display: 'RESTful'
            }
        ],
        default: 'rpc'
    },
    user: {
        display: 'Enable the APIs of users',
        description:
            'If enabled, a series of APIs will be created, including user registration, modification, login, and logout.',
        type: 'boolean',
        default: true
    }
}

;(async () => {
    try {
        await fs.rmdir(join(process.cwd(), 'saber'), { recursive: true })
    } catch {}

    const settings = await getArgs(process.argv, argDefinitions)
    console.log(settings)
    if (!settings) {
        return
    }

    try {
        await fs.cp(
            join(dir, 'template'),
            join(process.cwd(), settings.project),
            { recursive: true }
        )
    } catch (err) {
        console.error(err)
    }

    await run({
        name: settings.project,
        steps: [
            {
                type: 'replace',
                files: 'package.json',
                action: content => {
                    const pkg = JSON.parse(content)
                    pkg.name = settings.project
                    pkg.type = settings.module === 'esm' ? 'module' : 'commonjs'
                    pkg.dependencies = {
                        express: '^4.19.2'
                    }
                    if (settings.db === 'sqlite') {
                        pkg.dependencies.sqlite3 = '^5.1.7'
                    }
                    if (settings.orm === 'sequelize') {
                        pkg.dependencies.sequelize = '^6.37.3'
                    }
                    if (settings.user) {
                        pkg.dependencies.bcrypt = '^5.1.1'
                        pkg.dependencies.jsonwebtoken = '^9.0.2'
                        pkg.dependencies.uuid = '^9.0.1'
                    }
                    return JSON.stringify(pkg, null, 2)
                }
            },
            {
                type: 'replace',
                files: '**/*.js',
                settings
            },
            {
                required: settings.ext,
                type: 'ren',
                files: '**/*.js',
                ignore: 'frontend/**/*.js',
                action: f =>
                    f.replace(
                        /\.js$/,
                        settings.module === 'esm' ? '.mjs' : '.cjs'
                    )
            },
            {
                required: !settings.nodemon,
                type: 'rm',
                files: 'nodemon.json'
            },
            {
                required: !settings.prettier,
                type: 'rm',
                files: '.prettierrc'
            },
            {
                required: settings.prettier,
                type: 'replace',
                files: '.prettierrc',
                action: () => JSON.stringify(settings.prettier, null, settings.prettier.tabWidth ?? 4)
            },
            {
                required: settings.prettier,
                type: 'replace',
                files: '**/*.{js,cjs,mjs,html,vue,json}',
                action: content => content // prettier.format(content, { parser: 'babel' })
            }
        ]
    })
})()
