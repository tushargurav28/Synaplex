const GenderCheckbox = ({ onCheckboxChange, selectedGender }) => {
	return (
		<div className='flex'>
			<div className='form-control'>
				<label className={`label gap-2 cursor-pointer ${selectedGender === "male" ? "selected" : ""} `}>
					<span className='label-text text-cyan-300 font-semibold tracking-wider text-xs uppercase'>Male</span>
					<input
						type='checkbox'
						className='checkbox checkbox-sm border-cyan-500/50 checked:bg-cyan-500 hover:border-cyan-400 transition-colors'
						checked={selectedGender === "male"}
						onChange={() => onCheckboxChange("male")}
					/>
				</label>
			</div>
			<div className='form-control'>
				<label className={`label gap-2 cursor-pointer  ${selectedGender === "female" ? "selected" : ""}`}>
					<span className='label-text text-cyan-300 font-semibold tracking-wider text-xs uppercase'>Female</span>
					<input
						type='checkbox'
						className='checkbox checkbox-sm border-cyan-500/50 checked:bg-cyan-500 hover:border-cyan-400 transition-colors'
						checked={selectedGender === "female"}
						onChange={() => onCheckboxChange("female")}
					/>
				</label>
			</div>
		</div>
	);
};
export default GenderCheckbox;
