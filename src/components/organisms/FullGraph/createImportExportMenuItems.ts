import { createElement } from 'react';
import { FileOutputIcon, FileInputIcon, ArrowDownUpIcon } from 'lucide-react';
import type { ContextMenuItem } from '../../molecules/ContextMenu/ContextMenu';

type ImportExportMenuItemsConfig = {
  onExportState: () => void;
  onImportState: () => void;
  onExportRecording: () => void;
  onImportRecording: () => void;
  closeMenu: () => void;
};

function createImportExportMenuItems({
  onExportState,
  onImportState,
  onExportRecording,
  onImportRecording,
  closeMenu,
}: ImportExportMenuItemsConfig): ContextMenuItem[] {
  return [
    {
      id: 'import-export',
      label: 'Import/Export',
      icon: createElement(ArrowDownUpIcon, { className: 'w-4 h-4' }),
      separator: true,
      subItems: [
        {
          id: 'export-state',
          label: 'Export State',
          icon: createElement(FileOutputIcon, { className: 'w-4 h-4' }),
          onClick: () => {
            onExportState();
            closeMenu();
          },
        },
        {
          id: 'import-state',
          label: 'Import State',
          icon: createElement(FileInputIcon, { className: 'w-4 h-4' }),
          onClick: () => {
            onImportState();
            closeMenu();
          },
        },
        {
          id: 'export-recording',
          label: 'Export Recording',
          icon: createElement(FileOutputIcon, { className: 'w-4 h-4' }),
          separator: true,
          onClick: () => {
            onExportRecording();
            closeMenu();
          },
        },
        {
          id: 'import-recording',
          label: 'Import Recording',
          icon: createElement(FileInputIcon, { className: 'w-4 h-4' }),
          onClick: () => {
            onImportRecording();
            closeMenu();
          },
        },
      ],
    },
  ];
}

export { createImportExportMenuItems };
export type { ImportExportMenuItemsConfig };
