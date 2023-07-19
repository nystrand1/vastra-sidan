import { useState } from 'react';

interface CheckboxProps {
  label: string;
  isChecked: boolean;
  onChange?: (isChecked: boolean) => void;
  required?: boolean;
  name?: string;
  id?: string
}

const Checkbox = ({ label, isChecked, onChange, required, id, name } : CheckboxProps) => {
  const [checked, setChecked] = useState(isChecked);

  const handleCheckboxChange = () => {
    const newChecked = !checked;
    setChecked(newChecked);
    if (!onChange) return
    onChange(newChecked);
  };

  return (
    <label className="flex items-center space-x-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out"
        checked={checked}
        onChange={handleCheckboxChange}
        required={required}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
};

export default Checkbox;