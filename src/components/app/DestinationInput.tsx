import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  combineDestinationSuggestions,
  photonSuggestions,
  type DestinationSuggestion,
} from "@/lib/destination-search";
import { unwrap } from "@/lib/api";
import { getDestinationSuggestionsFn } from "@/server-functions";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;
const PHOTON_TIMEOUT_MS = 8_000;
const RESULT_CACHE_MS = 60_000;
export function DestinationInput({
  id,
  value,
  onChange,
  invalid,
  onBlur,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  onBlur?: () => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;
  const selectedValue = useRef<string | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  const resultCache = useRef(
    new Map<string, { expiresAt: number; saved: string[]; photon: DestinationSuggestion[] }>(),
  );
  const [saved, setSaved] = useState<string[]>([]);
  const [photon, setPhoton] = useState<DestinationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [photonError, setPhotonError] = useState(false);
  const [savedError, setSavedError] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = combineDestinationSuggestions(saved, photon);
  const query = value.trim();

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH || selectedValue.current === value) {
      setSaved([]);
      setPhoton([]);
      setLoading(false);
      setPhotonError(false);
      setSavedError(false);
      return;
    }

    const cacheKey = query.toLocaleLowerCase();
    const cached = resultCache.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setSaved(cached.saved);
      setPhoton(cached.photon);
      setPhotonError(false);
      setSavedError(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setSaved([]);
    setPhoton([]);
    setPhotonError(false);
    setSavedError(false);
    setActiveIndex(-1);

    let photonTimeout: number | undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        let photonTimedOut = false;
        const savedPromise = unwrap(getDestinationSuggestionsFn({ data: query.slice(0, 100) }))
          .then((destinations) => {
            if (
              !Array.isArray(destinations) ||
              !destinations.every((item) => typeof item === "string")
            ) {
              throw new Error("Saved destination search returned an invalid response.");
            }
            return { destinations, error: false };
          })
          .catch(() => ({ destinations: [] as string[], error: true }))
          .then((result) => {
            if (active) {
              setSaved(result.destinations);
              setSavedError(result.error);
            }
            return result;
          });
        photonTimeout = window.setTimeout(() => {
          photonTimedOut = true;
          controller.abort();
        }, PHOTON_TIMEOUT_MS);
        const photonPromise = fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&bbox=116.8,4.5,126.7,21.2`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        )
          .then((response) => {
            if (!response.ok) throw new Error("Photon search failed.");
            return response.json() as Promise<unknown>;
          })
          .then((data) => ({ results: photonSuggestions(data), error: false }))
          .catch((error: unknown) => {
            if (controller.signal.aborted && !photonTimedOut) throw error;
            return { results: [] as DestinationSuggestion[], error: true };
          })
          .finally(() => {
            if (photonTimeout !== undefined) window.clearTimeout(photonTimeout);
          })
          .then((result) => {
            if (active) {
              setPhoton(result.results);
              setPhotonError(result.error);
              setLoading(false);
            }
            return result;
          });

        try {
          const [savedResult, photonResult] = await Promise.all([savedPromise, photonPromise]);
          if (!active) return;
          if (!savedResult.error && !photonResult.error) {
            resultCache.current.set(cacheKey, {
              expiresAt: Date.now() + RESULT_CACHE_MS,
              saved: savedResult.destinations,
              photon: photonResult.results,
            });
            if (resultCache.current.size > 30) {
              const oldestKey = resultCache.current.keys().next().value;
              if (oldestKey) resultCache.current.delete(oldestKey);
            }
          }
        } catch (error) {
          if (!active || (controller.signal.aborted && !photonTimedOut)) return;
          if (active) {
            console.error("Destination search failed.", error);
            setPhotonError(true);
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (photonTimeout !== undefined) window.clearTimeout(photonTimeout);
      controller.abort();
    };
  }, [query, value]);

  function selectSuggestion(suggestion: DestinationSuggestion) {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    selectedValue.current = suggestion.value;
    onChange(suggestion.value);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) selectSuggestion(suggestion);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        id={inputId}
        value={value}
        maxLength={200}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && query.length >= MIN_QUERY_LENGTH}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid}
        aria-describedby={`${inputId}-search-status${invalid ? ` ${inputId}-err` : ""}`}
        onChange={(event) => {
          selectedValue.current = null;
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onBlur?.();
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type your destination"
      />
      {open && query.length >= MIN_QUERY_LENGTH && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div id={listId} role="listbox" aria-label="Destination suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                id={`${listId}-${index}`}
                key={`${suggestion.source}-${suggestion.value}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={`flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent ${
                  activeIndex === index ? "bg-accent" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block break-words font-medium">{suggestion.name}</span>
                  {suggestion.address && (
                    <span className="block break-words text-xs text-muted-foreground">
                      {suggestion.address}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          {loading && (
            <p
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Searching destinations…
            </p>
          )}
          {photonError && suggestions.length > 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
              Can&apos;t find your destination? Enter it manually, or select a previously used
              destination above.
            </p>
          )}
          {!loading && savedError && suggestions.length > 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
              Previously used destinations could not be loaded.
            </p>
          )}
          {(photonError || savedError) && suggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
              Can&apos;t find your destination? Enter it manually.
            </p>
          )}
          {!loading && suggestions.length === 0 && !photonError && !savedError && (
            <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
              No matching places found. You can enter the destination manually.
            </p>
          )}
        </div>
      )}
      <p id={`${inputId}-search-status`} className="mt-1 text-xs text-muted-foreground">
        {query.length < MIN_QUERY_LENGTH
          ? "Type at least 3 characters to search... "
          : ""}
      </p>
    </div>
  );
}
