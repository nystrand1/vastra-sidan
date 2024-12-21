

interface SelectFieldProps extends React.InputHTMLAttributes<HTMLSelectElement>  {
  options: { value: string; label: string, disabled?: boolean }[];
  label: string,
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>,
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

export const SelectField = ({ id, label, options, name, labelProps, onChange, className, ...props } : SelectFieldProps) => {
  return (
    <div>
      <label
        htmlFor={id}
        className="block mb-2 text-sm font-mediumtext-white"
        {...labelProps}>
          {label}
        </label>
        <select
          id={id}
          name={name}
          onChange={onChange}
          className={`bg-slate-800 w-full px-4 py-2 border-gray-300 text-slate-50 leading-6 border rounded-lg shadow-sm focus:ring focus:ring-opacity-50 focus:ring-blue-500 ${className || ''}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled} className="text-slate-50 bg-slate-700">
              {option.label}
            </option>
          ))}
        </select>
    </div>
  );
};