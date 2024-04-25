import { promises as fs } from 'fs'

import minimist from 'minimist'
import prompts from 'prompts'
import {
    lightGray,
    lightRed,
    lightGreen,
    lightYellow,
    lightBlue,
    lightMagenta,
    lightCyan
} from 'kolorist'

const randomColor = str => {
    const colors = [
        lightGray,
        lightRed,
        lightGreen,
        lightYellow,
        lightBlue,
        lightMagenta,
        lightCyan
    ]
    const r = colors[Math.floor(Math.random() * colors.length)]
    return r(str)
}

const warn = msg => console.log(lightYellow(msg))

const getDefault = async arg => {
    if (typeof arg.default === 'function') {
        return await arg.default()
    }
    return arg.default
}

const getUse = arg => {
    if (typeof arg.use === 'function') {
        return arg.use
    }
    return i => i
}

const defaultEndPadding = async (arg, val) => {
    if (val === (await getDefault(arg))) {
        return ' (default)'
    } else {
        return ''
    }
}

const defaultValuePadding = arg => {
    if (typeof arg.default === 'object') {
        return ''
    }
    return `(${arg.default}) `
}

const asyncMap = async (array, mapper) => {
    const results = []
    for (const item of array) {
        results.push(await mapper(item))
    }
    return results
}

const handleVersionAndHelp = async (args, argDefinitions) => {
    if (args.version || args.v) {
        const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'))
        console.log(pkg.version)
        process.exit(0)
    }
    if (args.help || args.h) {
        console.log('Usage:')
        console.log(
            'To specify arguments, you can use the following format: "--argument=value" or "--argument value".\n'
        )
        console.log(
            `${lightCyan('--version')} or ${lightCyan(
                '-v'
            )}\nDisplay the version of this application.\n`
        )
        console.log(
            `${lightCyan('--help')} or ${lightCyan(
                '-h'
            )}\nDisplay this help message.\n`
        )
        Object.keys(argDefinitions).forEach(k => {
            const arg = argDefinitions[k]
            console.log(`${lightCyan(arg.display)}`)
            console.log(arg.description)
            console.log(`argument: ${k}`)
            console.log(`type: ${Array.isArray(arg.type) ? 'enum' : arg.type}`)
            if (arg.index !== undefined) {
                console.log(`sequence: ${arg.index + 1}`)
            }
            if (arg.type === 'boolean') {
                console.log('available values: true, false')
            }
            if (arg.type === 'file') {
                console.log(
                    'Specify the value of the argument by setting the file path, or disable the argument if it is not specified.'
                )
            }
            if (Array.isArray(arg.type)) {
                console.log(
                    'available values: ' + arg.type.map(i => i.name).join(', ')
                )
            }
            if (arg.type !== 'file') {
                console.log(`default value: ${arg.default}`)
                if (
                    typeof arg.default === 'string' &&
                    arg.default.includes(' ')
                ) {
                    console.log(`example: --${k}="${arg.default}"`)
                } else {
                    console.log(`example: --${k}=${arg.default}`)
                }
            } else {
                console.log(`example: --${k}=path/to/the/file`)
            }
            console.log('')
        })
        process.exit(0)
    }
}

export const getArgs = async (args, argDefinitions) => {
    args = args.slice(2)
    const noArg = args.length === 0
    if (noArg) {
        const options = await asyncMap(Object.keys(argDefinitions), async k => {
            const arg = argDefinitions[k]
            arg.default = await getDefault(arg)
            const booleanChoices = [
                {
                    title: lightGreen(
                        'True' + (await defaultEndPadding(arg, true))
                    ),
                    value: true
                },
                {
                    title: lightRed(
                        'False' + (await defaultEndPadding(arg, false))
                    ),
                    value: false
                }
            ]
            const fileChoices = [
                { title: lightGreen('Use default'), value: arg.default },
                { title: lightRed('Disable'), value: null }
            ]
            let choices = []
            let type = 'select'
            let validate = null
            if (arg.type === 'string') {
                choices = null
                type = 'text'
                validate = async item => {
                    try {
                        await getUse(arg)(item)
                        return true
                    } catch (e) {
                        return e.message
                    }
                }
            } else if (arg.type === 'boolean') {
                choices = booleanChoices
            } else if (arg.type === 'file') {
                choices = fileChoices
            } else if (Array.isArray(arg.type)) {
                choices = await asyncMap(arg.type, async i => ({
                    title:
                        randomColor(i.display) +
                        (await defaultEndPadding(arg, i.name)),
                    value: i.name
                }))
            }
            return {
                type,
                validate,
                name: k,
                message: lightCyan(arg.display) + ' ' + arg.description,
                choices
            }
        })
        const promptSettings = await prompts(options)
        if (Object.keys(argDefinitions).some(a => !Object.keys(promptSettings).includes(a))) {
            warn('User canceled the prompt.')
            return null
        }
        return promptSettings
    } else {
        const miniArgs = minimist(args)
        await handleVersionAndHelp(miniArgs, argDefinitions)
        const settings = {}
        for (const k of Object.keys(argDefinitions)) {
            const arg = argDefinitions[k]
            arg.default = await getDefault(arg)
            const argVal =
                arg.index === undefined
                    ? miniArgs[k]
                    : miniArgs[k] ?? miniArgs._[arg.index]
            if (argVal === undefined) {
                warn(
                    `The value of "${k}" is not specified. The default value ${defaultValuePadding(
                        arg
                    )}is used.`
                )
                settings[k] = arg.default
            } else {
                settings[k] = argVal.toString()
                try {
                    settings[k] = await getUse(arg)(settings[k])
                } catch (e) {
                    warn(
                        `An error occurred while retrieving the value of "${k}". The default value ${defaultValuePadding(
                            arg
                        )}is used instead. ${e.message}`
                    )
                    settings[k] = arg.default
                }
                if (arg.type === 'boolean') {
                    const trueValues = ['true', 'yes', '1']
                    const falseValues = ['false', 'no', '0']
                    settings[k] = settings[k].toLowerCase()
                    if (
                        !trueValues.includes(settings[k]) &&
                        !falseValues.includes(settings[k])
                    ) {
                        warn(
                            `An error occurred due to expecting a boolean value of "${k}". The default value ${defaultValuePadding(
                                arg
                            )}is used instead.`
                        )
                    }
                    settings[k] = trueValues.includes(settings[k])
                }
                if (Array.isArray(arg.type)) {
                    const found = arg.type.find(
                        i => i.name.toLowerCase() === settings[k].toLowerCase()
                    )
                    if (found) {
                        settings[k] = found.name
                    } else {
                        warn(
                            `An error occurred due to an invalid value for "${k}", which must be within ${JSON.stringify(
                                arg.type.map(i => i.name)
                            )}. The default value ${defaultValuePadding(
                                arg
                            )}is used instead.`
                        )
                        settings[k] = arg.default
                    }
                }
            }
        }
        return settings
    }
}
