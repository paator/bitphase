export interface ChannelHeaderRoute {
	fromIndex: number;
	toIndices: number[];
	label: string;
	tone: 'noise' | 'envelope';
	lane: number;
	arrow: boolean;
}
