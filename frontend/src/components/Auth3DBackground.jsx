import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

const ParticleNetwork = () => {
    const pointsRef = useRef();
    
    // Generate random points
    const count = 1500;
    const [positions, colors] = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();
        
        for (let i = 0; i < count; i++) {
            // Spherical distribution
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos((Math.random() * 2) - 1);
            const radius = 10 + Math.random() * 20;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
            
            // Neon colors: mix of blue, purple, pink
            const r = Math.random();
            if (r < 0.33) color.setHex(0x00f3ff); // Cyan
            else if (r < 0.66) color.setHex(0x9d00ff); // Purple
            else color.setHex(0xff00e6); // Pink
            
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        return [positions, colors];
    }, [count]);

    useFrame((state, delta) => {
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
            pointsRef.current.rotation.x += delta * 0.02;
        }
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={colors.length / 3}
                    array={colors}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.15}
                vertexColors
                transparent
                opacity={0.8}
                sizeAttenuation={true}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};

const Auth3DBackground = () => {
    return (
        <div className="fixed inset-0 z-0 overflow-hidden bg-[#050510]">
            <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
                <ambientLight intensity={0.2} />
                <directionalLight position={[10, 10, 5]} intensity={1} />
                <pointLight position={[-10, -10, -5]} color="#00f3ff" intensity={2} />
                
                <ParticleNetwork />
                
                <Float speed={2} rotationIntensity={1} floatIntensity={2} position={[4, 2, 0]}>
                    <Sphere args={[1, 32, 32]}>
                        <MeshDistortMaterial
                            color="#9d00ff"
                            envMapIntensity={1}
                            clearcoat={1}
                            clearcoatRoughness={0}
                            metalness={0.8}
                            roughness={0.2}
                            distort={0.4}
                            speed={2}
                            emissive="#4a0080"
                        />
                    </Sphere>
                </Float>

                <Float speed={1.5} rotationIntensity={1.5} floatIntensity={1.5} position={[-4, -2, -2]}>
                    <Sphere args={[1.5, 32, 32]}>
                        <MeshDistortMaterial
                            color="#00f3ff"
                            envMapIntensity={1}
                            clearcoat={1}
                            clearcoatRoughness={0}
                            metalness={0.8}
                            roughness={0.2}
                            distort={0.3}
                            speed={3}
                            emissive="#006680"
                        />
                    </Sphere>
                </Float>
                
                <Stars radius={50} depth={50} count={3000} factor={4} saturation={1} fade speed={1} />
            </Canvas>
        </div>
    );
};

export default Auth3DBackground;
