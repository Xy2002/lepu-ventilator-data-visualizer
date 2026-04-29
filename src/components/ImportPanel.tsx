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
      <label className="import-button">
        选择 DATAFILE 文件夹
        <input
          type="file"
          multiple
          disabled={disabled}
          onChange={handleChange}
          {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
        />
      </label>
      <label className="secondary-button">
        选择 EDF 文件
        <input
          aria-label="选择 EDF 文件"
          type="file"
          multiple
          accept=".edf,.bin"
          disabled={disabled}
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
