import { ButtonRoot } from '@heroui/react';
import type { ImportedFileRef } from '../types';

interface ImportPanelProps {
  disabled: boolean;
  onImport: (files: ImportedFileRef[]) => void;
}

function toImportedFile(file: File): ImportedFileRef {
  return {
    name: file.name,
    path: file.webkitRelativePath || file.name,
    file,
  };
}

export function ImportPanel({ disabled, onImport }: ImportPanelProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onImport(Array.from(event.currentTarget.files ?? []).map(toImportedFile));
    event.currentTarget.value = '';
  }

  return (
    <div className="import-panel">
      <label>
        <ButtonRoot variant="primary" size="sm" isDisabled={disabled}>
          选择 DATAFILE 文件夹
          <input
            type="file"
            multiple
            disabled={disabled}
            onChange={handleChange}
            className="sr-only"
            {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
          />
        </ButtonRoot>
      </label>
      <label>
        <ButtonRoot variant="outline" size="sm" isDisabled={disabled}>
          选择 EDF 文件
          <input
            aria-label="选择 EDF 文件"
            type="file"
            multiple
            accept=".edf,.bin"
            disabled={disabled}
            onChange={handleChange}
            className="sr-only"
          />
        </ButtonRoot>
      </label>
    </div>
  );
}
