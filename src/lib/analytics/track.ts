/**
 * The public tracking API. Feature code imports this and nothing else from
 * the analytics module.
 *
 * The generic ties each event name to its property shape from the registry, so
 * a typo in a name or a missing property is a compile error rather than a
 * silently broken funnel.
 */
import { capture } from './client';
import type { EventMap, EventName } from './events';

export function track<K extends EventName>(name: K, props: EventMap[K]): void {
  capture(name, props);
}
