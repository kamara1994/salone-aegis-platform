'use client';

import { ImageOff, Maximize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Dialog } from '@/components/ui';
import { topicById } from '@/content/topics';

interface Visual {
  id: string;
  path: string;
  topic: string;
  title: string;
  lesson?: string;
  caption: string;
}

/**
 * Learn with images. Reads the annotated training visuals listed in /learn/visuals/manifest.json
 * (the image set is maintained separately). Images are generated training interfaces, not vendor screenshots.
 */
export function VisualsView({ onTopic }: { onTopic: (id: string) => void }) {
  const [items, setItems] = useState<Visual[] | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<Visual | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch('/learn/visuals/manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: { notice?: string; assets?: Visual[] }) => {
        setItems(m.assets ?? []);
        setNotice(m.notice ?? '');
      })
      .catch(() => setError(true));
  }, []);
  return (
    <div className="space-y-3" data-testid="visuals-view">
      <p className="max-w-3xl text-[13px] text-muted">Annotated pictures of real tools and situations: a SIEM timeline, a privileged logon, suspicious DNS. Read the callouts, then open the topic to go deeper.</p>
      {notice && <p className="text-[11.5px] text-faint">{notice}</p>}
      {error && <p className="rounded border border-line p-3 text-[13px] text-muted">The picture library is not available yet. It will appear here when it is added.</p>}
      {items && !items.length && <p className="text-[13px] text-muted">No pictures yet.</p>}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items?.map((v) => {
          const t = v.lesson ? topicById(v.lesson) : undefined;
          return (
            <li key={v.id} className="overflow-hidden rounded-[8px] border border-line bg-pane" data-testid={`visual-${v.id}`}>
              <button className="group relative block aspect-video w-full overflow-hidden bg-ink" onClick={() => setZoom(v)} aria-label={`Enlarge: ${v.title}`}>
                {broken.has(v.id) ? (
                  <span className="flex size-full flex-col items-center justify-center gap-1 text-[12px] text-muted">
                    <ImageOff className="size-5" /> Picture unavailable
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.path} alt={v.title} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" onError={() => setBroken(new Set(broken).add(v.id))} />
                )}
                <Maximize2 className="absolute top-2 right-2 size-4 text-white opacity-0 drop-shadow group-hover:opacity-100" />
              </button>
              <div className="space-y-1 p-3">
                <Badge>{v.topic}</Badge>
                <p className="font-semibold">{v.title}</p>
                <p className="text-[13px] text-muted">{v.caption}</p>
                {t && (
                  <button className="text-[13px] text-action underline" onClick={() => onTopic(t.id)}>
                    Learn the topic: {t.title}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!zoom} onClose={() => setZoom(null)} title={zoom?.title ?? ''} wide>
        {zoom && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.path} alt={zoom.title} className="max-h-[75vh] w-full object-contain" />
            <p className="text-[13px] text-muted">{zoom.caption}</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
