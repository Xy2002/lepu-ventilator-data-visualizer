import { useRef } from 'react';
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
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onImport(Array.from(event.currentTarget.files ?? []).map(toImportedFile));
    event.currentTarget.value = '';
  }

  return (
    <div className="import-panel">
      <ButtonRoot
        variant="primary"
        size="sm"
        isDisabled={disabled}
        onPress={() => folderRef.current?.click()}
      >
        选择 DATAFILE 文件夹
      </ButtonRoot>
      <input
        ref={folderRef}
        type="file"
        multiple
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
      />
      <ButtonRoot
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => filesRef.current?.click()}
      >
        选择 EDF 文件
      </ButtonRoot>
      <input
        ref={filesRef}
        aria-label="选择 EDF 文件"
        type="file"
        multiple
        accept=".edf,.bin"
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
    </div>
  );
}
