import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Auth3DBackground from "../../components/Auth3DBackground";

const Login = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const { loading, login } = useAuth();

	const handleSubmit = async (e) => {
		e.preventDefault();
		await login({ username, password });
	};

	return (
		<div className='relative flex flex-col items-center justify-center min-w-full h-screen mx-auto'>
            <Auth3DBackground />
			<div className='relative z-10 w-full max-w-md p-8 rounded-2xl shadow-[0_0_40px_rgba(0,243,255,0.15)] bg-[#050510]/60 border border-cyan-500/30 backdrop-filter backdrop-blur-xl'>
				<h1 className='text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-8'>
					Synaplex <span className='text-cyan-400 font-light text-xl tracking-widest block mt-2'>AI INTELLIGENCE</span>
				</h1>

				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<label className='label p-0 mb-2'>
							<span className='text-xs font-semibold tracking-widest text-cyan-300 uppercase'>Username</span>
						</label>
						<input
							type='text'
							placeholder='Enter username'
							className='w-full input bg-transparent border-0 border-b-2 border-cyan-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-0 rounded-none px-2 transition-colors'
							value={username}
							onChange={(e) => setUsername(e.target.value)}
						/>
					</div>

					<div>
						<label className='label p-0 mb-2'>
							<span className='text-xs font-semibold tracking-widest text-cyan-300 uppercase'>Password</span>
						</label>
						<input
							type='password'
							placeholder='Enter Password'
							className='w-full input bg-transparent border-0 border-b-2 border-cyan-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-0 rounded-none px-2 transition-colors'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
					
					<Link to='/signup' className='text-sm text-gray-400 hover:text-cyan-400 transition-colors mt-2 inline-block'>
						{"Don't"} have an account? Sign up
					</Link>

					<div className="pt-2">
						<button className='btn btn-block bg-gradient-to-r from-cyan-600 to-purple-600 border-none text-white hover:from-cyan-500 hover:to-purple-500 shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:shadow-[0_0_25px_rgba(0,243,255,0.6)] transition-all uppercase tracking-wider font-semibold' disabled={loading}>
							{loading ? <span className='loading loading-spinner text-cyan-300'></span> : "Enter System"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
export default Login;