/**
 * Desktop-pet plugin, browser half: one official-whale widget in the shell
 * overlay. The plugin mounts its own petStatus Remote contribution, then a
 * controller polls it for the current session and publishes each snapshot
 * into a store bound to the widget through the `hooks` compartment; the
 * widget itself owns no subscription machinery.
 * @module dsh-desktop-pet/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// The generated petStatus Remote contribution: mounted by this plugin and
// type-merged into the Client Remote namespace below.
import petStatusRemote from 'dsh-desktop-pet/remote'
import type {} from 'dsh-desktop-pet/remote'
import { Pet, type PetInjected } from './Pet.tsx'
import { PetController } from './controller.ts'
import { en, zh, type PetKey } from './locales.ts'

export { Pet } from './Pet.tsx'
export type { PetInjected, PetProps } from './Pet.tsx'
export { PetController } from './controller.ts'
export type { PetStatusRemote } from './controller.ts'
export type { PetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The desktop-pet widget's copy. */
    pet: PetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pet'

/** Required services: the slot registry, the Remote service, the session list, and copy. */
export const inject = ['slots', 'remote', 'sessions', 'locale']

/** One snapshot poll per second keeps the widget near-live without host churn. */
const POLL_INTERVAL_MS = 1000

/**
 * Client plugin body: mount the petStatus Remote, register the dictionaries,
 * the snapshot poll, and the shell-overlay widget.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-desktop-pet: dictionaries')

  await ctx.remote.$mount(petStatusRemote)

  const controller = new PetController(ctx.remote.petStatus)
  ctx.effect(() => {
    const timer = setInterval(() => {
      const sessionId = ctx.sessions.list.getSnapshot().current
      if (sessionId === undefined) return
      void controller.refresh(sessionId)
    }, POLL_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, 'dsh-desktop-pet: snapshot poll')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'ui-pet',
    order: 60,
    locale: NS,
    inject: (): PetInjected => ({ hooks: { petSnapshot: controller.store } }),
  }, Pet))
}
