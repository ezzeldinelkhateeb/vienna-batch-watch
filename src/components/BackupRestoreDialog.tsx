import { Archive } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BackupRestoreManager } from "@/components/BackupRestoreManager";

interface BackupRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupRestoreDialog({ open, onOpenChange }: BackupRestoreDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Archive className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">{t("backupRestoreTitle")}</DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {t("backupRestoreSubtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <BackupRestoreManager onDone={() => onOpenChange(false)} isModal={true} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
