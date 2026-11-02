import { useEffect, useId, useState } from "react";

import {
  finishFolderDetailsRequest,
  type FolderDetailsRequest,
  useFolderDetailsRequest,
} from "../sidebarFolderNameRequest";
import {
  normalizeFolderName,
  SIDEBAR_FOLDER_COLORS,
  type SidebarFolderColor,
} from "../sidebarFolders.logic";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function SidebarFolderDialogHost() {
  const request = useFolderDetailsRequest((state) => state.request);
  // oxlint-disable-next-line t3code/react-effect-budget -- An unmounted host must settle a pending request, or its caller waits forever.
  useEffect(() => () => finishFolderDetailsRequest(null), []);
  return request ? <SidebarFolderDialog key={request.title} request={request} /> : null;
}

function SidebarFolderDialog({ request }: { readonly request: FolderDetailsRequest }) {
  const id = useId();
  const [name, setName] = useState(request.initial.name);
  const [color, setColor] = useState<SidebarFolderColor>(request.initial.color);
  const normalized = normalizeFolderName(name);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finishFolderDetailsRequest(null);
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalized !== null) finishFolderDetailsRequest({ name: normalized, color });
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            <DialogDescription>Folders are saved on this device only.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-name`}>
                Name
                <Input
                  nativeInput
                  id={`${id}-name`}
                  className="h-9 sm:h-8"
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Label>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium" id={`${id}-color`}>
                  Color
                </span>
                <div role="radiogroup" aria-labelledby={`${id}-color`} className="flex gap-2">
                  {(Object.keys(SIDEBAR_FOLDER_COLORS) as SidebarFolderColor[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={option === color}
                      aria-label={option}
                      onClick={() => setColor(option)}
                      className={cn(
                        "size-6 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        option === color && "ring-2 ring-inset ring-foreground",
                      )}
                      style={{ backgroundColor: SIDEBAR_FOLDER_COLORS[option] }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => finishFolderDetailsRequest(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={normalized === null}>
              {request.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
