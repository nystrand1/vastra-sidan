interface CheckboxProps {
  label: string;
  required?: boolean;
  name?: string;
  id?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const Checkbox = ({ label, required, id, name, onChange} : CheckboxProps) => {
  return (
    <label className="flex items-center space-x-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out"
        onChange={onChange}
        required={required}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
};

export default Checkbox;