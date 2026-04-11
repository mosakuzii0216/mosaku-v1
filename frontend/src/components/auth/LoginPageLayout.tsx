import React from 'react';
import { ForestAnimationLayer } from './ForestAnimationLayer';
import { ParticleCanvas } from './ParticleCanvas';

interface LoginPageLayoutProps {
	children: React.ReactNode;
}

export function LoginPageLayout({ children }: LoginPageLayoutProps) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#00552e] via-[#1a4d2e] to-[#47885e]">
			{/* 背景アニメーションレイヤー */}
			<ForestAnimationLayer />

			{/* マウスパーティクル Canvas */}
			<ParticleCanvas />

			{/* フォームコンテンツエリア */}
			<div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
				{children}
			</div>
		</div>
	);
}
