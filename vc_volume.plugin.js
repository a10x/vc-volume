/**
 * @name VCVolume 
 * @author a10x
 * @description Adds a volume slider to your current VC to control the volumes of all the users in the VC at the same time
 * @version 0.0.1
 * @source https://gist.github.com/a10x/84e305a2a9d6759e792c637779f59713
 */

class _VCVolumeSetup{
	constructor() { 
		this._config = {
			info: {
				name: "VCVolume",
				authors: [
					{
						name: "a10x",
						github_username: "a10x",
					}
				],
				version: "0.0.1",
				description: "Adds a volume slider to your current VC to control the volumes of all the users in the VC at the same time",
				github: "https://gist.github.com/a10x/84e305a2a9d6759e792c637779f59713",
				github_raw: "https://gist.githubusercontent.com/a10x/84e305a2a9d6759e792c637779f59713/raw/c087630f39dfd39f68385888a64be2a1410dc4a9/vc_volume.plugin.js"
			},
			defaultConfig: []
		};
	}
	getName() { return this._config.info.name;}
	getAuthor() { return this._config.info.authors.map(a => a.name).join(", ");}
	getDescription() { return this._config.info.description;}
	getVersion() { return this._config.info.version;}
	getConfig(){ return this._config;}
	load() {
		BdApi.showConfirmationModal("ZeresPluginLibrary is missing",
				[`ZeresPluginLibrary is needed for ${this._config.info.name}. Please click Download to install it.`],
				{
					confirmText: "Download",
					cancelText: "Cancel",
					onConfirm: () => {
						require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, _, body) => {
							if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
							await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
						});
					}
				});
	}
	start() {}
	stop() {}
}

const _VCVolumeV3 = ([Plugin, Api]) =>{
	return ((Plugin, Api) => {
		const {DiscordModules: {React, Dispatcher, DiscordConstants, UserInfoStore}, Patcher, WebpackModules, DCM} = Api;
		const {getVoiceChannelId} = WebpackModules.getByProps("getVoiceChannelId");
		const VoiceChannelStore = WebpackModules.getByProps("getVoiceStatesForChannel");
		const Slider = WebpackModules.getByDisplayName("Slider");
		const SettingsStore = WebpackModules.getByProps("getLocalVolume");
		const SettingsActions = WebpackModules.getByProps("setLocalVolume");
		const AudioConvert = WebpackModules.getByProps("perceptualToAmplitude");

		const getUserVolume = userId=>Math.round(AudioConvert.amplitudeToPerceptual(SettingsStore.getLocalVolume(userId, undefined)));
		const setUserVolume = (userId, value)=>userId!==UserInfoStore.getId() ? SettingsActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(value), undefined):1;
		const getChannelAverageVolume = userIds=>userIds.reduce((total, userId) => userId!==UserInfoStore.getId() ? total+getUserVolume(userId):total, 0)/userIds.length-1;
		const setUserVolumeUsing = (userId, value) => setUserVolume(userId, getUserVolume(userId)/value);
		const setUsersVolumeUsing = (userIds, value)=>userIds.forEach(userId => setUserVolumeUsing(userId, value));

		let volumeDivisor = 1;
		
		const ChannelVolume = ({initialValue, userIds}) =>{
			let oldValue = -1;
			let currentValue = !initialValue ? 100 : initialValue;

			return React.createElement("div", 
				{
					style: {
						margin: "2px 0",
						position: "relative",
						boxSizing: "border-box",
					}
				},
				[
					React.createElement("div", 
						{
							style: {
								boxSizing: "border-box",
								display: "flex",
								alignItems: "flex-start",
								justifyContent: "center",
								minHeight: "32px",
								padding: "6px 8px",
								flexDirection: "column",
							}
						}, ["Channel Volume"]),
					React.createElement("div", {
						style: {
							position: "relative",
							top: "-14px",
							margin: "0 8px",
							padding: "2px 2px"
						}
					}, React.createElement(Slider,
							{
								mini: true,
								initialValue: currentValue,
								minValue: 0,
								maxValue: 100,
								onValueChange: (value)=>{
									oldValue = currentValue;
									currentValue = value;
									volumeDivisor = oldValue/currentValue;
									setUsersVolumeUsing(userIds, volumeDivisor);
								}
							}
						)
					)
				]
			);
		}

		let numUsers = 0;

		return class VCVolume extends Plugin {
			constructor() {super();}

			onVoiceStateUpdates(event){
				for(const voiceUpdate of event.voiceStates){
					if(!getVoiceChannelId())volumeDivisor=1;
					if(voiceUpdate.channelId && getVoiceChannelId() !== voiceUpdate.channelId)return;
					if(voiceUpdate.userId === UserInfoStore.getId())return;
					const voiceCount = Object.keys(VoiceChannelStore.getVoiceStatesForChannel(getVoiceChannelId())).length;
					if(voiceCount > numUsers)setUserVolumeUsing(voiceUpdate.userId, volumeDivisor);
					numUsers = voiceCount;
				}
			}

			onStart() {
				Dispatcher.subscribe(DiscordConstants.ActionTypes.VOICE_STATE_UPDATES, this.onVoiceStateUpdates);
				this.patcher();
			}

			patcher(){
				DCM.getDiscordMenu("useChannelHideNamesItem").then(context => {
					Patcher.after(context, "default", (_, [props], retValue)=>{
						if(!props.isVocal() || props.id !== getVoiceChannelId())return;
						const userIds = Object.keys(VoiceChannelStore.getVoiceStatesForChannel(props.id));
						return [
							retValue,
							DCM.buildMenuItem({
								type: "custom",
								label: "Channel Volume",
								render: ()=> ChannelVolume({
									initialValue: getChannelAverageVolume(userIds),
									userIds: userIds
								})
							}),
						]
					})
				});
			}

			onStop(){
				Patcher.unpatchAll();
				Dispatcher.unsubscribe(DiscordConstants.ActionTypes.VOICE_STATE_UPDATES, this.onVoiceStateUpdates);	
			}
		}
	})(Plugin, Api);
}

module.exports = (() => {
	const config = new _VCVolumeSetup().getConfig();
	return !global.ZeresPluginLibrary ? _VCVolumeSetup :_VCVolumeV3(global.ZeresPluginLibrary.buildPlugin(config));
})();
