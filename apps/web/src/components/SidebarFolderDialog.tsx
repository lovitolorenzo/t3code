import { useEffect, useId, useState } from "react";

import {
  finishFolderNameRequest,
  type FolderNameRequest,
  useFolderNameRequest,
} from "../sidebarFolderNameRequest";
import { normalizeFolderName } from "../sidebarFolders.logic";
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
  const request = useFolderNameRequest((state) => state.request);
  // oxlint-disable-next-line t3code/react-effect-budget -- An unmounted host must settle a pending request, or its caller waits forever.
  useEffect(() => () => finishFolderNameRequest(null), []);
  return request ? <SidebarFolderDialog key={request.title} request={request} /> : null;
}

function SidebarFolderDialog({ request }: { readonly request: FolderNameRequest }) {
  const id = useId();
  const [name, setName] = useState(request.initialName);
  const normalized = normalizeFolderName(name);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finishFolderNameRequest(null);
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalized !== null) finishFolderNameRequest(normalized);
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            <DialogDescription>Folders are saved on this device only.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
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
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finishFolderNameRequest(null)}>
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
