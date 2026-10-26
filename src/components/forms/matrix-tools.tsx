"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const matrixTableClass = "w-max min-w-full border-separate border-spacing-0";

export const matrixLabelCellClass =
  "sticky left-0 z-10 w-[11.5rem] min-w-[11.5rem] max-w-[14rem] bg-card p-2 align-top";

export const matrixLabelShadowClass = "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.28)]";

export const matrixEnvHeadClass =
  "w-[16rem] min-w-[16rem] border-l p-2 text-left align-top text-xs font-semibold uppercase tracking-wide";

export const matrixEnvCellClass =
  "w-[16rem] min-w-[16rem] border-l border-t p-2 align-top";

type ScrollEdge = "none" | "start" | "mid" | "end";

function edgeOf(left: number, max: number): ScrollEdge {
  if (max <= 1) return "none";
  if (left <= 1) return "start";
  if (left >= max - 1) return "end";
  return "mid";
}

export function useHorizontalScrollSync() {
  const nodes = useRef(new Set<HTMLDivElement>());
  const syncing = useRef(false);
  const scrollLeftRef = useRef(0);
  const maxScrollRef = useRef(0);
  const edgeRef = useRef<ScrollEdge>("none");
  const listeners = useRef(new Set<(left: number, max: number) => void>());
  const [edge, setEdge] = useState<ScrollEdge>("none");
  const [maxScroll, setMaxScroll] = useState(0);

  const emit = useCallback((left: number, max: number) => {
    scrollLeftRef.current = left;
    maxScrollRef.current = max;
    const nextEdge = edgeOf(left, max);
    if (edgeRef.current !== nextEdge) {
      edgeRef.current = nextEdge;
      setEdge(nextEdge);
    }
    setMaxScroll((prev) => (Math.abs(prev - max) < 1 ? prev : max));
    for (const listener of listeners.current) listener(left, max);
  }, []);

  const readMetrics = useCallback(() => {
    let max = 0;
    let left = 0;
    for (const node of nodes.current) {
      const nodeMax = Math.max(0, node.scrollWidth - node.clientWidth);
      if (nodeMax >= max) {
        max = nodeMax;
        left = node.scrollLeft;
      }
    }
    return { left, max };
  }, []);

  const publish = useCallback(() => {
    const metrics = readMetrics();
    emit(metrics.left, metrics.max);
  }, [emit, readMetrics]);

  const register = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return () => {};
      nodes.current.add(node);
      publish();
      return () => {
        nodes.current.delete(node);
      };
    },
    [publish],
  );

  const onScroll = useCallback(
    (source: HTMLDivElement) => {
      if (syncing.current) return;
      syncing.current = true;
      const left = source.scrollLeft;
      for (const node of nodes.current) {
        if (node !== source && Math.abs(node.scrollLeft - left) > 0.5) {
          node.scrollLeft = left;
        }
      }
      syncing.current = false;
      const max = Math.max(0, source.scrollWidth - source.clientWidth);
      emit(left, Math.max(max, readMetrics().max));
    },
    [emit, readMetrics],
  );

  const applyLeft = useCallback(
    (left: number, max: number) => {
      const next = Math.min(Math.max(0, left), max);
      syncing.current = true;
      for (const node of nodes.current) {
        if (Math.abs(node.scrollLeft - next) > 0.5) node.scrollLeft = next;
      }
      syncing.current = false;
      emit(next, max);
    },
    [emit],
  );

  const setScrollLeft = useCallback(
    (left: number) => {
      const metrics = readMetrics();
      applyLeft(left, metrics.max);
    },
    [applyLeft, readMetrics],
  );

  const nudge = useCallback(
    (direction: -1 | 1) => {
      const node = nodes.current.values().next().value as HTMLDivElement | undefined;
      if (!node) return;
      const max = Math.max(0, node.scrollWidth - node.clientWidth);
      const delta = Math.max(200, node.clientWidth * 0.75) * direction;
      applyLeft(node.scrollLeft + delta, max);
    },
    [applyLeft],
  );

  const subscribe = useCallback((fn: (left: number, max: number) => void) => {
    listeners.current.add(fn);
    fn(scrollLeftRef.current, maxScrollRef.current);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return {
    register,
    onScroll,
    setScrollLeft,
    nudge,
    subscribe,
    publish,
    edge,
    maxScroll,
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, [role='radio'], [role='checkbox'], [role='combobox'], [role='slider']",
    ),
  );
}

export function MatrixPanScroll({
  panEnabled,
  register,
  onScrollSync,
  publish,
  className,
  children,
}: {
  panEnabled: boolean;
  register: (node: HTMLDivElement | null) => () => void;
  onScrollSync: (source: HTMLDivElement) => void;
  publish: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    active: boolean;
  } | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canPan, setCanPan] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = register(el);
    const update = () => {
      updateEdges(el);
      publish();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [publish, register]);

  function updateEdges(el: HTMLDivElement) {
    const pan = el.scrollWidth - el.clientWidth > 2;
    const overflow = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setCanPan((prev) => (prev === pan ? prev : pan));
    setCanScrollRight((prev) => (prev === overflow ? prev : overflow));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && !panEnabled) return;
    if (!panEnabled && isInteractiveTarget(event.target)) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      active: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.active) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (!panEnabled && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      current.active = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = current.scrollLeft - dx;
    onScrollSync(event.currentTarget);
    updateEdges(event.currentTarget);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.active) setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onScroll={(event) => {
          onScrollSync(event.currentTarget);
          updateEdges(event.currentTarget);
        }}
        className={cn(
          "overflow-x-auto overscroll-x-contain",
          (canPan || panEnabled) &&
            "cursor-grab [&_[role=checkbox]]:cursor-pointer [&_[role=combobox]]:cursor-pointer [&_button]:cursor-pointer [&_input[type=date]]:cursor-text [&_input[type=number]]:cursor-text [&_input[type=radio]]:cursor-pointer [&_input[type=text]]:cursor-text [&_textarea]:cursor-text",
          panEnabled && "select-none [&_*]:pointer-events-none",
          dragging && "cursor-grabbing [&_*]:cursor-grabbing",
          className,
        )}
      >
        {children}
      </div>
      {canScrollRight ? (
        <div className="pointer-events-none absolute bottom-2 right-0 top-0 w-8 bg-gradient-to-l from-card to-transparent" />
      ) : null}
    </div>
  );
}

const UNLINK = "__unlink__";

export function EqualizeColumnSelect({
  env,
  environments,
  linkedTo,
  onChange,
}: {
  env: string;
  environments: string[];
  linkedTo: string | null;
  onChange: (source: string | null) => void;
}) {
  const others = environments.filter((item) => item !== env);
  if (others.length === 0) return null;

  return (
    <Select
      key={linkedTo ?? UNLINK}
      defaultValue={linkedTo ?? undefined}
      onValueChange={(source) => onChange(source === UNLINK ? null : source)}
    >
      <SelectTrigger
        className="mt-1 h-7 w-full text-xs font-medium normal-case tracking-normal"
        aria-label={
          linkedTo ? `${env} igual a ${linkedTo}` : `Igualar ${env} a outro ambiente`
        }
      >
        <SelectValue placeholder="Igualar" />
      </SelectTrigger>
      <SelectContent>
        {linkedTo ? <SelectItem value={UNLINK}>Não igualar</SelectItem> : null}
        {others.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
