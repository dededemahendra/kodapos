import { type AiBlock, highlightNumbers, parseAiText } from '~/lib/ai-format';
import { cn } from '~/lib/utils';

/** Figures get weight and tabular figures so columns of money scan cleanly. */
function Runs({ text }: { text: string }) {
  return (
    <>
      {highlightNumbers(text).map((run, i) =>
        run.emphasis ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional within one line
          <span className="font-medium text-foreground tabular-nums" key={i}>
            {run.text}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional within one line
          <span key={i}>{run.text}</span>
        )
      )}
    </>
  );
}

function Block({ block }: { block: AiBlock }) {
  if (block.kind === 'heading') {
    return (
      <p className="pt-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {block.text}
      </p>
    );
  }
  if (block.kind === 'list') {
    return (
      <ul className="space-y-1.5">
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list order is the model's output order
          <li className="flex gap-2" key={i}>
            <span
              aria-hidden="true"
              className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-primary"
            />
            <span className="min-w-0 flex-1">
              <Runs text={item} />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p>
      <Runs text={block.text} />
    </p>
  );
}

/**
 * Renders an LLM answer as structured blocks rather than one flat paragraph.
 *
 * Falls back to the raw text when the model returns nothing parseable, so a
 * model that ignores the requested shape still reads fine.
 */
export function AiResponse({ text, className }: { text: string; className?: string }) {
  const blocks = parseAiText(text);
  if (blocks.length === 0) {
    return <p className={cn('whitespace-pre-line text-sm leading-relaxed', className)}>{text}</p>;
  }
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed', className)}>
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional within one answer
        <Block block={block} key={i} />
      ))}
    </div>
  );
}
