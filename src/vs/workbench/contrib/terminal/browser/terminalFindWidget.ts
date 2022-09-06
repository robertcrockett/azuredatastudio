/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { FindReplaceState } from 'vs/editor/contrib/find/browser/findState';
import { ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class TerminalFindWidget extends SimpleFindWidget {
	protected _findInputFocused: IContextKey<boolean>;
	protected _findWidgetFocused: IContextKey<boolean>;
	private _findWidgetVisible: IContextKey<boolean>;

	constructor(
		findState: FindReplaceState,
		@IContextViewService _contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(findState, { showOptionButtons: true, showResultCount: true, type: 'Terminal' }, _contextViewService, _contextKeyService, keybindingService);

		this._register(findState.onFindReplaceStateChange(() => {
			this.show();
		}));
		this._findInputFocused = TerminalContextKeys.findInputFocus.bindTo(this._contextKeyService);
		this._findWidgetFocused = TerminalContextKeys.findFocus.bindTo(this._contextKeyService);
		this._findWidgetVisible = TerminalContextKeys.findVisible.bindTo(_contextKeyService);
		this._register(this._themeService.onDidColorThemeChange(() => {
			if (this._findWidgetVisible) {
				this.find(true, true);
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('workbench.colorCustomizations') && this._findWidgetVisible) {
				this.find(true, true);
			}
		}));
	}

	find(previous: boolean, update?: boolean) {
		const instance = this._terminalService.activeInstance;
		if (!instance) {
			return;
		}
		if (previous) {
			instance.xterm?.findPrevious(this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue(), incremental: update });
		} else {
			instance.xterm?.findNext(this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() });
		}
	}

	override reveal(initialInput?: string): void {
		const instance = this._terminalService.activeInstance;
		if (instance && this.inputValue && this.inputValue !== '') {
			// trigger highlight all matches
			instance.xterm?.findPrevious(this.inputValue, { incremental: true, regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() }).then(foundMatch => {
				this.updateButtons(foundMatch);
			});
		}
		this.updateButtons(false);

		super.reveal(initialInput);
		this._findWidgetVisible.set(true);
	}

	override show(initialInput?: string) {
		super.show(initialInput);
		this._findWidgetVisible.set(true);
	}

	override hide() {
		super.hide();
		this._findWidgetVisible.reset();
		const instance = this._terminalService.activeInstance;
		if (instance) {
			instance.focus();
		}
		// Terminals in a group currently share a find widget, so hide
		// all decorations for terminals in this group
		const activeGroup = this._terminalGroupService.activeGroup;
		if (instance?.target !== TerminalLocation.Editor && activeGroup) {
			for (const terminal of activeGroup.terminalInstances) {
				terminal.xterm?.clearSearchDecorations();
			}
		} else {
			instance?.xterm?.clearSearchDecorations();
		}
	}

	protected async _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		const instance = this._terminalService.activeInstance;
		if (instance) {
			return instance.xterm?.findResult;
		}
		return undefined;
	}

	protected _onInputChanged() {
		// Ignore input changes for now
		const instance = this._terminalService.activeInstance;
		if (instance?.xterm) {
			instance.xterm.findPrevious(this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue(), incremental: true }).then(foundMatch => {
				this.updateButtons(foundMatch);
			});
		}
		return false;
	}

	protected _onFocusTrackerFocus() {
		const instance = this._terminalService.activeInstance;
		if (instance) {
			instance.notifyFindWidgetFocusChanged(true);
		}
		this._findWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur() {
		const instance = this._terminalService.activeInstance;
		if (instance) {
			instance.notifyFindWidgetFocusChanged(false);
		}
		this._findWidgetFocused.reset();
	}

	protected _onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
	}

	protected _onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
	}

	findFirst() {
		const instance = this._terminalService.activeInstance;
		if (instance) {
			if (instance.hasSelection()) {
				instance.clearSelection();
			}
			instance.xterm?.findPrevious(this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() });
		}
	}
}